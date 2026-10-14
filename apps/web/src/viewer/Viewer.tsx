import type { CodeViewItem } from '@pierre/diffs'
import { CodeView, WorkerPoolContextProvider } from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { FileActions } from './FileActions'
import { createContentLoader, viewerOptions, viewerStyle } from './options'
import { syncItems } from './sync-items'

type Item = CodeViewItem<undefined>

const POOL = {
  poolSize: Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1),
  workerFactory: () => new DiffsWorker(),
}

const selectItems = (state: SessionState) => state.items
const selectSettings = (state: Settings) => state

export default function Viewer() {
  const { api, session, viewer } = useApp()
  const items = useSession(selectItems)
  const settings = useSettings(selectSettings)
  const synced = useRef<readonly Item[]>([])

  const loader = useMemo(() => createContentLoader(api, () => session.get().target), [api, session])
  const options = useMemo(() => viewerOptions(settings, loader), [settings, loader])
  const highlighter = useMemo(() => ({ theme: settings.themes }), [settings.themes])

  useEffect(() => {
    const handle = viewer.current
    if (!handle) return
    syncItems(handle, synced.current, items)
    synced.current = items
  }, [items, viewer])

  const renderMeta = useCallback(
    (item: Item) => (item.type === 'diff' ? <FileActions path={item.fileDiff.name} /> : null),
    [],
  )

  return (
    <WorkerPoolContextProvider poolOptions={POOL} highlighterOptions={highlighter}>
      <CodeView<undefined>
        ref={viewer}
        initialItems={[]}
        options={options}
        style={viewerStyle(settings)}
        className="h-full overflow-y-auto [contain:strict]"
        renderHeaderMetadata={renderMeta}
      />
    </WorkerPoolContextProvider>
  )
}
