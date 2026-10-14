import { Button, Kbd, Toaster, TooltipProvider } from '@duck-diff/ui'
import { SearchIcon } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { CompareBar } from '../compare/CompareBar'
import { GraphSidebar } from '../graph/GraphSidebar'
import type { GraphState } from '../graph/store'
import { useView } from '../hooks/useView'
import { HelpDialog } from '../keyboard/HelpDialog'
import { useKeyboard } from '../keyboard/useKeyboard'
import type { Api } from '../lib/api'
import { useStore } from '../lib/store'
import type { View } from '../lib/view-url'
import { useLiveRefresh } from '../live/useLiveRefresh'
import { Palette } from '../palette/Palette'
import { CommentsSheet } from '../review/CommentsSheet'
import { SettingsPopover } from '../settings/SettingsPopover'
import { Sidebar } from '../sidebar/Sidebar'
import { WritesProvider } from '../writes/WritesProvider'
import { ActivityRail } from './ActivityRail'
import { AppProvider, useApp } from './AppProvider'
import { Shell } from './Shell'
import { StatusBar } from './StatusBar'
import { useThemeClass } from './useThemeClass'

const Viewer = lazy(() => import('../viewer/Viewer'))
const GraphView = lazy(() => import('../graph/GraphView'))

const SHIPPED: View[] = ['changes', 'graph']

const selectCommitCount = (state: GraphState) => state.entries.length

function GraphTitle() {
  const { graph } = useApp()
  const count = useStore(graph, selectCommitCount)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <h1>Commit graph</h1>
      <span className="text-muted-foreground tabular-nums">
        {count.toLocaleString()} {count === 1 ? 'commit' : 'commits'}
      </span>
    </div>
  )
}

function Screen() {
  useThemeClass()
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  useKeyboard({ palette: () => setPalette(true), help: () => setHelp(true) })
  const live = useLiveRefresh()
  const { view } = useView()
  const search = (
    <Button
      size="sm"
      variant="outline"
      className="w-72 justify-start gap-2 text-muted-foreground"
      aria-label="Search files and actions"
      onClick={() => setPalette(true)}>
      <SearchIcon />
      <span className="min-w-0 flex-1 truncate text-start">Search files</span>
      <Kbd className="ms-auto">Ctrl K</Kbd>
    </Button>
  )
  const graph = view === 'graph'
  return (
    <>
      <Shell
        rail={<ActivityRail views={SHIPPED} />}
        topBar={
          graph ? (
            <>
              <GraphTitle />
              {search}
            </>
          ) : (
            <>
              <CompareBar />
              {search}
              <CommentsSheet />
              <SettingsPopover />
            </>
          )
        }
        sidebar={graph ? <GraphSidebar /> : <Sidebar />}
        sidebarLabel={graph ? 'Branches and tags' : 'Changed files'}
        viewer={<Suspense fallback={null}>{graph ? <GraphView /> : <Viewer />}</Suspense>}
        status={<StatusBar live={live} />}
      />
      <Palette open={palette} onOpenChange={setPalette} />
      <HelpDialog open={help} onOpenChange={setHelp} />
    </>
  )
}

export function App({ api }: { api?: Api }) {
  return (
    <AppProvider api={api}>
      <TooltipProvider>
        <WritesProvider>
          <Screen />
          <Toaster position="bottom-right" />
        </WritesProvider>
      </TooltipProvider>
    </AppProvider>
  )
}
