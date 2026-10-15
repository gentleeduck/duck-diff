import { type DiffTarget, targetKey } from '@duck-diff/protocol'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { DiffView } from '../diff/DiffView'
import { highlighter } from '../diff/highlighter'
import { buildPage } from '../diff/page'
import type { RowContextValue } from '../diff/RowViews'
import type { DiffLine, DiffRow } from '../diff/rows'
import { type PullReviewState, pullOf } from '../github/pull-review'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
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
import { visibleItems } from './visible-items'
import { WriteButtons } from './WriteButtons'

const selectItems = (state: SessionState) => state.items
const selectFiles = (state: SessionState) => state.files
const selectStatus = (state: SessionState) => state.status
const selectFolders = (folders: ReadonlySet<string>) => folders
// Above this a file keeps hunk-only colors; tokenizing it whole would cost more than it shows.
const FULL_LINES = 3000
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
  const { api, viewer, reviews, viewed, fileHistory, pullReview, changesFolders } = useApp()
  const plain = useSession(selectItems)
  const files = useSession(selectFiles)
  const status = useSession(selectStatus)
  const { target } = useTarget()
  const shownKey = targetKey(target)
  const { comments, draft } = useStore(reviews, selectReviews)
  const remote = useStore(pullReview, selectRemote)
  const pull = pullOf(target)
  useEffect(() => {
    pullReview.load(pull).catch(() => {})
  }, [pullReview, pull])
  const viewedState = useStore(viewed, selectViewed)
  const settings = useSettings(selectSettings)
  const writes = useWrites()
  const kinds = useMemo(() => actionsFor(target), [target])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  // Paths the header chevron folded (true) or opened (false), on top of the viewed marks.
  const [toggled, setToggled] = usePerTarget(shownKey, emptyToggles)
  const foldedFolders = useStore(changesFolders, selectFolders)
  const folded = useMemo(() => {
    const paths = viewedPaths(viewedState, target, files)
    for (const [path, fold] of toggled) if (fold) paths.add(path)
    if (settings.tests === 'fold') for (const file of files) if (isTestFile(file.path)) paths.add(file.path)
    // A folder folded in the tree folds its files here too.
    for (const folder of foldedFolders)
      for (const file of files) if (file.path.startsWith(`${folder}/`)) paths.add(file.path)
    return paths
  }, [viewedState, target, files, toggled, settings.tests, foldedFolders])
  const shown = useMemo(() => visibleItems(plain, settings.tests), [plain, settings.tests])
  const opened = useMemo(() => new Set([...toggled].filter(([, fold]) => !fold).map(([path]) => path)), [toggled])
  const annotate = useMemo(createAnnotator, [])
  const items = useMemo(
    () => annotate(shown, comments, draft, folded, files, opened, remote),
    [annotate, shown, comments, draft, folded, files, opened, remote],
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

  const context = useMemo<RowContextValue>(
    () => ({
      settings,
      tokens(item, side, line) {
        const file = page.files.get(item.id)
        if (!file) return undefined
        // The whole file, once read, colors with its full context; until then each hunk colors on its own.
        loadSource(item, true)
        const source = sources.current.get(sourceKey(item))
        const text = typeof source === 'object' ? source[side] : null
        const full = text ? highlighter.text(`${sourceKey(item)}:${side}`, sourcePath(item, side), text) : null
        if (full) return full.get(line)
        return highlighter
          .tokens(`${item.fileDiff.cacheKey}:${file.key}`, item.fileDiff.name, file.rows)
          ?.[side].get(line)
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
      comment(item: NoteItem, line: DiffLine, side) {
        const number = side === 'additions' ? line.newNo : line.oldNo
        if (number === null) return
        reviews.startDraft({ path: item.fileDiff.name, side, line: number, lineHash: lineHash(line.text) })
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
        <FileHeader path={path} file={file} collapsed={collapsed} onToggle={toggle}>
          <FileActions
            path={path}
            viewed={folded.has(path)}
            onViewed={() => file && viewed.toggle(target, file)}
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
    [api, canOpen, byPath, kinds, writes, folded, viewed, target, fileHistory, setToggled],
  )

  const renderNote = useCallback((note: Note) => <ReviewNote note={note} />, [])

  if (status === 'ready' && files.length === 0) {
    return <p className="p-6 text-muted-foreground">{EMPTY[target.kind]}</p>
  }
  return <DiffView ref={viewer} page={page} context={context} renderHeader={renderHeader} renderNote={renderNote} />
}
