import { type ChangedFile, type DiffTarget, targetKey } from '@duck-diff/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { CodeHover } from '../code-nav/CodeHover'
import { refForSide, type SymbolUnder } from '../code-nav/symbol-at'
import { useSymbolClick } from '../code-nav/useSymbolClick'
import { DiffView } from '../diff/DiffView'
import { highlighter } from '../diff/highlighter'
import { buildPage } from '../diff/page'
import type { RowContextValue } from '../diff/RowViews'
import type { DiffLine, DiffRow } from '../diff/rows'
import { openFile } from '../files/open-file'
import { type PullReviewState, pullOf } from '../github/pull-review'
import { hasScrollMemory } from '../hooks/useScrollMemory'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { isPopping } from '../lib/history'
import { itemId } from '../lib/items'
import { createStore, useStore } from '../lib/store'
import { isTestFile } from '../lib/tests'
import { lineHash } from '../review/anchor'
import { createAnnotator, type Note, type NoteItem } from '../review/annotations'
import { ReviewNote } from '../review/ReviewNote'
import type { ReviewsState } from '../review/reviews'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { type ViewedState, viewedPaths } from '../state/viewed'
import { useWrites } from '../writes/WritesProvider'
import { actionsFor, type WriteKind } from './actions'
import { FileActions } from './FileActions'
import { FileHeader } from './FileHeader'
import { fileNote } from './file-info'
import { type CodeSelection, useLineSelection } from './line-selection'
import { type PickedLine, pickedLines, selectedCells } from './picked-lines'
import { SelectionBar } from './SelectionBar'
import { visibleItems } from './visible-items'
import { WriteButtons } from './WriteButtons'

const selectItems = (state: SessionState) => state.items
const selectFiles = (state: SessionState) => state.files
const selectStatus = (state: SessionState) => state.status
const selectFolders = (folders: ReadonlySet<string>) => folders
// Above this a file keeps hunk-only colors; tokenizing it whole would cost more than it shows.
const FULL_LINES = 3000

interface MarkRange {
  start: number
  end: number
  startCol?: number
  endCol?: number
}

// The picked characters on one line of a word selection: from startCol on its first line, to endCol on its last.
function markCols(range: MarkRange, number: number, length: number): string {
  if (range.startCol === undefined || range.endCol === undefined) return ''
  const from = number === range.start ? range.startCol : 0
  const to = number === range.end ? range.endCol : length
  return `|${from}-${to}`
}

// One side's text for lines from..to, read off the rows the diff already built.
function sideLines(rows: readonly DiffRow[], side: 'additions' | 'deletions', from: number, to: number): string[] {
  const found = new Map<number, string>()
  const take = (line: DiffLine | null | undefined) => {
    const number = line ? (side === 'additions' ? line.newNo : line.oldNo) : null
    if (line && number !== null && number >= from && number <= to) found.set(number, line.text)
  }
  for (const row of rows) {
    if (row.type === 'line') take(row.line)
    else if (row.type === 'pair') {
      take(row.left)
      take(row.right)
    }
  }
  return [...found.keys()].sort((a, b) => a - b).map((number) => found.get(number) ?? '')
}
// A drag across both sides of a stacked diff marks the lines between its ends; worked out once per drag.
const crossCache = new WeakMap<CodeSelection, Set<string>>()
function crossKeys(selection: CodeSelection, rows: readonly DiffRow[]): Set<string> {
  let keys = crossCache.get(selection)
  if (!keys) {
    keys = new Set(
      selectedCells(rows, selection).map(
        ({ side, line }) => `${side}:${side === 'deletions' ? line.oldNo : line.newNo}`,
      ),
    )
    crossCache.set(selection, keys)
  }
  return keys
}
const sourceKey = (item: NoteItem) => item.fileDiff.cacheKey ?? item.id

const EMPTY: Record<DiffTarget['kind'], string> = {
  local: 'Nothing to commit. The working tree matches the last commit.',
  staged: 'Nothing is staged. Stage files or hunks from the working tree to see them here.',
  unstaged: 'No unstaged changes. Everything left is already staged.',
  range: 'These two points have the same content.',
  commit: 'This commit changes no files.',
}
const selectSettings = (state: Settings) => state
const selectReviews = (state: ReviewsState) => state
const selectRemote = (state: PullReviewState) => state.comments
const selectPending = (state: PullReviewState) => state.pending
const selectGitHubViewed = (state: PullReviewState) => state.viewed
const selectViewed = (state: ViewedState) => state

// State that belongs to one comparison and starts over when the comparison changes.
function usePerTarget<T>(key: string, initial: () => T): [T, (update: (prev: T) => T) => void] {
  const [state, setState] = useState(() => ({ key, value: initial() }))
  const value = state.key === key ? state.value : initial()
  const update = useCallback(
    (fn: (prev: T) => T) => setState((prev) => ({ key, value: fn(prev.key === key ? prev.value : initial()) })),
    [key, initial],
  )
  return [value, update]
}

const emptyToggles = () => new Map<string, boolean>() as ReadonlyMap<string, boolean>
const emptyContents = () => new Map<string, readonly string[]>() as ReadonlyMap<string, readonly string[]>
const emptyExpanded = () => new Map<string, ReadonlySet<number>>() as ReadonlyMap<string, ReadonlySet<number>>

export default function Viewer() {
  const {
    api,
    viewer,
    reviews,
    viewed,
    fileHistory,
    pullReview,
    changesFolders,
    diffFile,
    fileSelection,
    fileLine,
    fileAt,
    diffTop,
  } = useApp()
  const { show } = useView()
  const plain = useSession(selectItems)
  const files = useSession(selectFiles)
  const status = useSession(selectStatus)
  const { target } = useTarget()
  const shownKey = targetKey(target)
  const { comments, draft } = useStore(reviews, selectReviews)
  const remote = useStore(pullReview, selectRemote)
  const pending = useStore(pullReview, selectPending)
  const pull = pullOf(target)
  useEffect(() => {
    pullReview.load(pull).catch(() => {})
  }, [pullReview, pull])

  // Files already viewed on GitHub start viewed here.
  const githubViewed = useStore(pullReview, selectGitHubViewed)
  useEffect(() => {
    if (pull === null || githubViewed.size === 0) return
    const local = viewedPaths(viewed.get(), target, files)
    for (const file of files) if (githubViewed.has(file.path) && !local.has(file.path)) viewed.toggle(target, file)
  }, [pull, githubViewed, files, target, viewed])
  const viewedState = useStore(viewed, selectViewed)
  const settings = useSettings(selectSettings)
  const writes = useWrites()
  const kinds = useMemo(() => actionsFor(target), [target])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  // Paths the header chevron folded (true) or opened (false), on top of the viewed marks.
  const [toggled, setToggled] = usePerTarget(shownKey, emptyToggles)
  const foldedFolders = useStore(changesFolders, selectFolders)
  // The Viewed box shows only the viewed mark; folding by the chevron is not the same thing.
  const viewedSet = useMemo(() => viewedPaths(viewedState, target, files), [viewedState, target, files])
  const folded = useMemo(() => {
    const paths = new Set(viewedSet)
    for (const [path, fold] of toggled) if (fold) paths.add(path)
    if (settings.tests === 'fold') for (const file of files) if (isTestFile(file.path)) paths.add(file.path)
    // A folder folded in the tree folds its files here too.
    for (const folder of foldedFolders)
      for (const file of files) if (file.path.startsWith(`${folder}/`)) paths.add(file.path)
    return paths
  }, [viewedSet, files, toggled, settings.tests, foldedFolders])
  const shown = useMemo(() => visibleItems(plain, settings.tests), [plain, settings.tests])
  const opened = useMemo(() => new Set([...toggled].filter(([, fold]) => !fold).map(([path]) => path)), [toggled])
  const annotate = useMemo(createAnnotator, [])
  const items = useMemo(
    () => annotate(shown, comments, draft, folded, files, opened, remote, pending),
    [annotate, shown, comments, draft, folded, files, opened, remote, pending],
  )

  // Unchanged lines are read from the full file the first time someone opens a gap.
  const [expanded, setExpanded] = usePerTarget(shownKey, emptyExpanded)
  const [contents, setContents] = usePerTarget(shownKey, emptyContents)

  const layout = settings.diffStyle === 'split' ? 'split' : 'unified'
  const page = useMemo(
    () =>
      buildPage(items, layout, (item) => {
        const lines = contents.get(item.fileDiff.name)
        const open = expanded.get(item.id) ?? new Set<number>()
        const all =
          settings.expandUnchanged && lines
            ? new Set(item.fileDiff.hunks.map((_, i) => i).concat(item.fileDiff.hunks.length))
            : open
        return { newLines: lines, expanded: all, key: `${lines ? 'full' : 'patch'}:${[...all].join(',')}` }
      }),
    [items, layout, contents, expanded, settings.expandUnchanged],
  )

  // Whole old and new files per diff item, read for files on or near the screen. Huge ones keep hunk-only colors.
  const sources = useRef(new Map<string, { old: string | null; new: string | null } | 'pending'>())
  const sourcePath = useCallback(
    (item: NoteItem, side: 'old' | 'new') =>
      side === 'old' ? (byPath.get(item.fileDiff.name)?.oldPath ?? item.fileDiff.name) : item.fileDiff.name,
    [byPath],
  )
  // Sources belong to one comparison; a new one starts empty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the comparison's key is the trigger
  useEffect(() => sources.current.clear(), [shownKey])
  const loadSource = useCallback(
    (item: NoteItem, now: boolean) => {
      const key = sourceKey(item)
      if (sources.current.has(key)) return
      const file = byPath.get(item.fileDiff.name)
      if (!file || file.binary) return
      sources.current.set(key, 'pending')
      const ref = { path: file.path, oldPath: file.oldPath }
      const read = (side: 'old' | 'new') =>
        (side === 'old' && (file.status === 'added' || file.status === 'untracked')) ||
        (side === 'new' && file.status === 'deleted')
          ? Promise.resolve(null)
          : api.content(target, side, ref).catch(() => null)
      void Promise.all([read('old'), read('new')]).then(([old, next]) => {
        const fits = (text: string | null) => (text && text.split('\n').length <= FULL_LINES ? text : null)
        const source = { old: fits(old), new: fits(next) }
        sources.current.set(key, source)
        if (source.old) highlighter.text(`${key}:old`, sourcePath(item, 'old'), source.old, now)
        if (source.new) highlighter.text(`${key}:new`, sourcePath(item, 'new'), source.new, now)
      })
    },
    [api, target, byPath, sourcePath],
  )

  // A file asked for by the tree, the palette or back and forward is scrolled to once it is on the page.
  const wanted = useRef<string | null>(hasScrollMemory(`diff:${shownKey}`, isPopping()) ? null : diffFile.get())
  const reveal = useCallback(() => {
    const path = wanted.current
    if (!path || !page.starts.has(itemId(path))) return
    wanted.current = null
    requestAnimationFrame(() => viewer.current?.scrollTo({ type: 'item', id: itemId(path), align: 'start' }))
  }, [page, viewer])
  useEffect(() => reveal(), [reveal])
  useEffect(
    () =>
      diffFile.subscribe(() => {
        // Back and forward put the diff where it was; the file it jumped to then is already in view.
        if (isPopping() && hasScrollMemory(`diff:${shownKey}`, true)) return
        wanted.current = diffFile.get()
        reveal()
      }),
    [diffFile, reveal, shownKey],
  )

  // Lines that already carry a comment stay marked, over the whole range it covers.
  const commentRanges = useRef(new Map<string, MarkRange[]>())
  commentRanges.current = useMemo(() => {
    const ranges = new Map<string, MarkRange[]>()
    const add = (path: string, side: string, range: MarkRange) => {
      const key = `${path}|${side}`
      ranges.set(key, [...(ranges.get(key) ?? []), range])
    }
    for (const comment of comments)
      add(comment.path, comment.side, {
        start: comment.startLine ?? comment.line,
        end: comment.line,
        startCol: comment.startCol,
        endCol: comment.endCol,
      })
    for (const comment of remote) {
      if (comment.line === null || comment.inReplyTo !== null) continue
      add(comment.path, comment.side === 'LEFT' ? 'deletions' : 'additions', {
        start: comment.startLine ?? comment.line,
        end: comment.line,
      })
    }
    return ranges
  }, [comments, remote])

  const onTopItem = useCallback(
    (item: NoteItem | null) => {
      const path = item?.fileDiff.name ?? null
      if (diffTop.get() !== path) diffTop.set(path)
    },
    [diffTop],
  )
  const diffRoot = useCallback(() => document.querySelector<HTMLElement>('[data-diff-view]'), [])
  // A comment on selected words covers their lines and keeps the exact columns, so the words stay highlighted.
  const commentOnSelection = useCallback(
    (raw: CodeSelection) => {
      // A drag from one side of a stacked diff to the other comments on the line it ended on.
      const picked =
        raw.side === raw.endSide
          ? raw
          : { ...raw, side: raw.endSide, startLine: raw.endLine, startCol: 0, endCol: Number.MAX_SAFE_INTEGER }
      const index = page.starts.get(picked.item)
      const item = index === undefined ? undefined : page.rows[index]?.item
      if (!item) return
      const lines = sideLines(page.files.get(item.id)?.rows ?? [], picked.side, picked.startLine, picked.endLine)
      // Several lines are taken whole; part of one line keeps its exact words.
      const whole =
        picked.startLine < picked.endLine || (picked.startCol === 0 && picked.endCol >= (lines.at(-1)?.length ?? 0))
      reviews.startDraft({
        path: item.fileDiff.name,
        side: picked.side,
        line: picked.endLine,
        ...(picked.startLine < picked.endLine ? { startLine: picked.startLine } : {}),
        ...(whole ? {} : { startCol: picked.startCol, endCol: picked.endCol }),
        lineHash: lineHash(lines.at(-1) ?? ''),
        text: lines.join('\n'),
      })
    },
    [page, reviews],
  )
  const locateSymbol = useCallback(
    (found: SymbolUnder) => {
      const side = found.side ?? 'additions'
      const index = found.key === null ? undefined : page.starts.get(found.key)
      const name = index === undefined ? undefined : page.rows[index]?.item.fileDiff.name
      const path = !name ? null : side === 'deletions' ? (byPath.get(name)?.oldPath ?? name) : name
      return { ref: refForSide(target, side), path }
    },
    [page, byPath, target],
  )
  useSymbolClick(diffRoot, locateSymbol)
  const selecting = useMemo(() => createStore<CodeSelection | null>(null), [])
  const pageRef = useRef(page)
  pageRef.current = page
  const [bar, setBar] = useState<{
    selection: CodeSelection
    rect: DOMRect
    picks: PickedLine[]
    file: ChangedFile
  } | null>(null)
  // Where lines can be written back, a drag offers that next to commenting; elsewhere it comments at once.
  const onPicked = useCallback(
    (selection: CodeSelection, rect: DOMRect) => {
      const index = page.starts.get(selection.item)
      const item = index === undefined ? undefined : page.rows[index]?.item
      const file = item ? byPath.get(item.fileDiff.name) : undefined
      const picks = item && file && kinds.length ? pickedLines(page.files.get(item.id)?.rows ?? [], selection) : []
      if (!file || !picks.length || file.status === 'untracked' || file.status === 'conflicted') {
        commentOnSelection(selection)
        return
      }
      selecting.set(selection)
      setBar({ selection, rect, picks, file })
    },
    [page, byPath, kinds.length, commentOnSelection, selecting],
  )
  useLineSelection(diffRoot, selecting.set, onPicked)
  const closeBar = useCallback(() => {
    setBar(null)
    selecting.set(null)
  }, [selecting])

  const anchor = useRef(0)
  const dragging = useRef(false)
  useEffect(() => {
    const stop = () => {
      dragging.current = false
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const context = useMemo<RowContextValue>(
    () => ({
      settings,
      tokens(item, side, line) {
        const file = page.files.get(item.id)
        if (!file) return undefined
        // The hunks on screen color first, being small; the whole file follows behind them and, once ready,
        // takes over with its full context (strings and comments that open above a hunk).
        const hunks = highlighter.tokens(`${item.fileDiff.cacheKey}:${file.key}`, item.fileDiff.name, file.rows)
        loadSource(item, false)
        const source = sources.current.get(sourceKey(item))
        const text = typeof source === 'object' ? source[side] : null
        const full = text ? highlighter.text(`${sourceKey(item)}:${side}`, sourcePath(item, side), text, false) : null
        return (full ?? hunks?.[side])?.get(line)
      },
      prefetch(item) {
        const file = page.files.get(item.id)
        if (file) highlighter.prefetch(`${item.fileDiff.cacheKey}:${file.key}`, item.fileDiff.name, file.rows)
        loadSource(item, false)
      },
      kinds(item) {
        const file = byPath.get(item.fileDiff.name)
        return file && file.status !== 'untracked' && file.status !== 'conflicted' ? kinds : []
      },
      comment(item: NoteItem, line: DiffLine, side, extend = false) {
        const number = side === 'additions' ? line.newNo : line.oldNo
        if (number === null) return
        const open = reviews.get().draft
        const same = open && open.path === item.fileDiff.name && open.side === side
        if (!extend || !same) anchor.current = number
        const [from, to] = [Math.min(anchor.current, number), Math.max(anchor.current, number)]
        const lines = sideLines(page.files.get(item.id)?.rows ?? [], side, from, to)
        const last = lines.at(-1) ?? line.text
        reviews.startDraft({
          path: item.fileDiff.name,
          side,
          line: to,
          ...(from < to ? { startLine: from } : {}),
          lineHash: lineHash(last),
          text: lines.length ? lines.join('\n') : line.text,
        })
      },
      startSelect(item, line, side) {
        dragging.current = true
        context.comment(item, line, side)
      },
      dragOver(item, line, side) {
        const open = reviews.get().draft
        if (dragging.current && open?.path === item.fileDiff.name && open.side === side)
          context.comment(item, line, side, true)
      },
      subscribeMarks(listener) {
        const stops = [reviews.subscribe(listener), pullReview.subscribe(listener), selecting.subscribe(listener)]
        return () => {
          for (const stop of stops) stop()
        }
      },
      lineMark(item, side, number, length) {
        if (number === null) return ''
        const path = item.fileDiff.name
        const live = selecting.get()
        if (live && live.item === item.id && live.side !== live.endSide) {
          if (crossKeys(live, pageRef.current.files.get(item.id)?.rows ?? []).has(`${side}:${number}`)) return 'draft'
        } else if (
          live &&
          live.item === item.id &&
          live.side === side &&
          number >= live.startLine &&
          number <= live.endLine
        ) {
          const partial = live.startLine === live.endLine
          return `draft${partial ? markCols({ start: live.startLine, end: live.endLine, startCol: live.startCol, endCol: live.endCol }, number, length) : ''}`
        }
        const open = reviews.get().draft
        const draft =
          open && open.path === path && open.side === side
            ? { start: open.startLine ?? open.line, end: open.line, startCol: open.startCol, endCol: open.endCol }
            : null
        if (draft && number >= draft.start && number <= draft.end) return `draft${markCols(draft, number, length)}`
        const hit = commentRanges.current
          .get(`${path}|${side}`)
          ?.find((range) => number >= range.start && number <= range.end)
        return hit ? `comment${markCols(hit, number, length)}` : ''
      },
      write(kind: WriteKind, item, index) {
        const file = byPath.get(item.fileDiff.name)
        const hunk = item.fileDiff.hunks[index]
        if (file && hunk) void writes.perform(kind, file, { index, hunk })
      },
      expand(item, gap: Extract<DiffRow, { type: 'gap' }>) {
        const path = item.fileDiff.name
        setExpanded((prev) => new Map(prev).set(item.id, new Set([...(prev.get(item.id) ?? []), gap.before])))
        if (contents.has(path)) return
        const file = byPath.get(path)
        api.content(target, 'new', { path, oldPath: file?.oldPath ?? null }).then(
          (text) => setContents((prev) => new Map(prev).set(path, (text ?? '').split('\n'))),
          () => {},
        )
      },
    }),
    [
      settings,
      page,
      byPath,
      kinds,
      reviews,
      writes,
      api,
      target,
      contents,
      setExpanded,
      setContents,
      loadSource,
      sourcePath,
      pullReview,
      selecting,
    ],
  )

  // Only a server started from Neovim can open files there, so the button follows repo info.
  const [canOpen, setCanOpen] = useState(false)
  useEffect(() => {
    api.repo().then(
      (info) => setCanOpen(info.nvim),
      () => {},
    )
  }, [api])

  const renderHeader = useCallback(
    (item: NoteItem) => {
      const path = item.fileDiff.name
      const file = byPath.get(path)
      const firstLine = item.fileDiff.hunks[0]?.additionStart ?? 1
      const collapsed = Boolean(item.collapsed)
      const toggle = () => setToggled((prev) => new Map(prev).set(path, !collapsed))
      return (
        <FileHeader
          path={path}
          file={file}
          collapsed={collapsed}
          onToggle={toggle}
          onOpen={
            pull === null && file?.status !== 'deleted'
              ? () => {
                  openFile({ fileSelection, fileLine, fileAt }, path)
                  show('files')
                }
              : undefined
          }>
          <FileActions
            path={path}
            viewed={viewedSet.has(path)}
            onViewed={() => {
              if (!file) return
              const nowViewed = !viewedPaths(viewed.get(), target, files).has(file.path)
              viewed.toggle(target, file)
              // Marking viewed folds the file and unmarking opens it, whatever the chevron did before.
              setToggled((prev) => {
                if (!prev.has(path)) return prev
                const next = new Map(prev)
                next.delete(path)
                return next
              })
              // On a pull request the mark is GitHub's too, so it shows on github.com and comes back next time.
              if (pull !== null) pullReview.setViewed(file.path, nowViewed).catch(() => {})
            }}
            onHistory={() => fileHistory.set(path)}
            note={file ? fileNote(file) : null}
            onOpen={canOpen ? () => void api.open(path, firstLine) : undefined}
            writes={
              file && file.status !== 'conflicted' && kinds.length > 0 ? (
                <WriteButtons kinds={kinds} scope="file" onWrite={(kind) => void writes.perform(kind, file)} />
              ) : null
            }
          />
        </FileHeader>
      )
    },
    [
      api,
      canOpen,
      byPath,
      kinds,
      writes,
      viewedSet,
      viewed,
      target,
      fileHistory,
      setToggled,
      files,
      pull,
      pullReview,
      fileSelection,
      fileLine,
      fileAt,
      show,
    ],
  )

  const renderNote = useCallback((note: Note) => <ReviewNote note={note} />, [])

  if (status === 'ready' && files.length === 0) {
    return <p className="p-6 text-muted-foreground">{EMPTY[target.kind]}</p>
  }
  return (
    <div className="relative h-full">
      <DiffView
        ref={viewer}
        page={page}
        context={context}
        renderHeader={renderHeader}
        renderNote={renderNote}
        scrollKey={shownKey}
        onTopItem={onTopItem}
      />
      <CodeHover root={diffRoot} locate={locateSymbol} />
      {bar ? (
        <SelectionBar
          rect={bar.rect}
          count={bar.picks.length}
          kinds={kinds}
          onComment={() => {
            closeBar()
            commentOnSelection(bar.selection)
          }}
          onWrite={(kind) => {
            closeBar()
            void writes.performLines(kind, bar.file, bar.picks)
          }}
          onClose={closeBar}
        />
      ) : null}
    </div>
  )
}
