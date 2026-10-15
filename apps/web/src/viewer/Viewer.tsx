import { targetKey } from '@duck-diff/protocol'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { DiffView } from '../diff/DiffView'
import { highlighter } from '../diff/highlighter'
import { buildPage } from '../diff/page'
import type { RowContextValue } from '../diff/RowViews'
import type { DiffLine, DiffRow } from '../diff/rows'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
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
import { WriteButtons } from './WriteButtons'

const selectItems = (state: SessionState) => state.items
const selectFiles = (state: SessionState) => state.files
const selectSettings = (state: Settings) => state
const selectReviews = (state: ReviewsState) => state
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
  const { api, viewer, reviews, viewed, fileHistory } = useApp()
  const plain = useSession(selectItems)
  const files = useSession(selectFiles)
  const { target } = useTarget()
  const shownKey = targetKey(target)
  const { comments, draft } = useStore(reviews, selectReviews)
  const viewedState = useStore(viewed, selectViewed)
  const settings = useSettings(selectSettings)
  const writes = useWrites()
  const kinds = useMemo(() => actionsFor(target), [target])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  // Paths the header chevron folded (true) or opened (false), on top of the viewed marks.
  const [toggled, setToggled] = usePerTarget(shownKey, emptyToggles)
  const folded = useMemo(() => {
    const paths = viewedPaths(viewedState, target, files)
    for (const [path, fold] of toggled) if (fold) paths.add(path)
    return paths
  }, [viewedState, target, files, toggled])
  const opened = useMemo(() => new Set([...toggled].filter(([, fold]) => !fold).map(([path]) => path)), [toggled])
  const annotate = useMemo(createAnnotator, [])
  const items = useMemo(
    () => annotate(plain, comments, draft, folded, files, opened),
    [annotate, plain, comments, draft, folded, files, opened],
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

  const context = useMemo<RowContextValue>(
    () => ({
      settings,
      tokens(item, side, line) {
        const file = page.files.get(item.id)
        if (!file) return undefined
        return highlighter
          .tokens(`${item.fileDiff.cacheKey}:${file.key}`, item.fileDiff.name, file.rows)
          ?.[side].get(line)
      },
      prefetch(item) {
        const file = page.files.get(item.id)
        if (file) highlighter.prefetch(`${item.fileDiff.cacheKey}:${file.key}`, item.fileDiff.name, file.rows)
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
    [settings, page, byPath, kinds, reviews, writes, api, target, contents, setExpanded, setContents],
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

  return <DiffView ref={viewer} page={page} context={context} renderHeader={renderHeader} renderNote={renderNote} />
}
