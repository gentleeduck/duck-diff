import type { CodeViewItem, DiffLineAnnotation, LineAnnotation } from '@pierre/diffs'
import { CodeView, type CodeViewHandle, WorkerPoolContextProvider } from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
import { createAnnotator, type Note } from '../review/annotations'
import { ReviewNote } from '../review/ReviewNote'
import type { ReviewsState } from '../review/reviews'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { type ViewedState, viewedPaths } from '../state/viewed'
import { useWrites } from '../writes/WritesProvider'
import { actionsFor } from './actions'
import { FileActions } from './FileActions'
import { type HoveredLineGetter, HunkToolbar } from './HunkToolbar'
import { createContentLoader, viewerOptions, viewerStyle } from './options'
import { syncItems } from './sync-items'
import { WriteButtons } from './WriteButtons'

type Item = CodeViewItem<Note>

const POOL = {
  poolSize: Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1),
  workerFactory: () => new DiffsWorker(),
}

const selectItems = (state: SessionState) => state.items
const selectFiles = (state: SessionState) => state.files
const selectSettings = (state: Settings) => state
const selectReviews = (state: ReviewsState) => state
const selectViewed = (state: ViewedState) => state

export default function Viewer() {
  const { api, session, viewer, reviews, viewed, fileHistory } = useApp()
  const plain = useSession(selectItems)
  const files = useSession(selectFiles)
  const { target } = useTarget()
  const { comments, draft } = useStore(reviews, selectReviews)
  const viewedState = useStore(viewed, selectViewed)
  const folded = useMemo(() => viewedPaths(viewedState, target, files), [viewedState, target, files])
  const annotate = useMemo(createAnnotator, [])
  const items = useMemo(() => annotate(plain, comments, draft, folded), [annotate, plain, comments, draft, folded])
  const writes = useWrites()
  const kinds = useMemo(() => actionsFor(target), [target])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const settings = useSettings(selectSettings)
  const synced = useRef<readonly Item[]>([])
  // CodeView hands over its handle after mount, so syncing waits for it rather than for the first render.
  const [handle, setHandle] = useState<CodeViewHandle<Note, undefined> | null>(null)
  const attach = useCallback(
    (next: CodeViewHandle<Note, undefined> | null) => {
      viewer.current = next
      synced.current = []
      setHandle(next)
    },
    [viewer],
  )

  const loader = useMemo(() => createContentLoader(api, () => session.get().target), [api, session])
  const options = useMemo(() => ({ ...viewerOptions(settings, loader), enableGutterUtility: true }), [settings, loader])
  const highlighter = useMemo(() => ({ theme: settings.themes }), [settings.themes])

  useEffect(() => {
    if (!handle) return
    syncItems(handle, synced.current, items)
    synced.current = items
  }, [items, handle])

  // Only a server started from Neovim can open files there, so the button follows repo info.
  const [canOpen, setCanOpen] = useState(false)
  useEffect(() => {
    api.repo().then(
      (info) => setCanOpen(info.nvim),
      () => {},
    )
  }, [api])

  const renderMeta = useCallback(
    (item: Item) => {
      if (item.type !== 'diff') return null
      const path = item.fileDiff.name
      const file = byPath.get(path)
      const firstLine = item.fileDiff.hunks[0]?.additionStart ?? 1
      return (
        <FileActions
          path={path}
          viewed={folded.has(path)}
          onViewed={() => file && viewed.toggle(target, file)}
          onHistory={() => fileHistory.set(path)}
          onOpen={canOpen ? () => void api.open(path, firstLine) : undefined}
          writes={
            file && kinds.length > 0 ? (
              <WriteButtons kinds={kinds} scope="file" onWrite={(kind) => void writes.perform(kind, file)} />
            ) : null
          }
        />
      )
    },
    [api, canOpen, byPath, kinds, writes, folded, viewed, target, fileHistory],
  )

  const renderGutter = useCallback(
    (getHoveredLine: HoveredLineGetter, item: Item) => <HunkToolbar item={item} getHoveredLine={getHoveredLine} />,
    [],
  )

  const renderNote = useCallback(
    (annotation: LineAnnotation<Note> | DiffLineAnnotation<Note>) =>
      annotation.metadata ? <ReviewNote note={annotation.metadata} /> : null,
    [],
  )

  return (
    <WorkerPoolContextProvider poolOptions={POOL} highlighterOptions={highlighter}>
      <CodeView<Note>
        ref={attach}
        initialItems={[]}
        options={options}
        style={viewerStyle(settings)}
        className="h-full overflow-y-auto [contain:strict]"
        renderHeaderMetadata={renderMeta}
        renderGutterUtility={renderGutter}
        renderAnnotation={renderNote}
      />
    </WorkerPoolContextProvider>
  )
}
