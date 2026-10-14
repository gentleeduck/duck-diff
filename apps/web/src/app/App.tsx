import { Button, Kbd, Toaster, TooltipProvider } from '@duck-diff/ui'
import { SearchIcon } from 'lucide-react'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import { CompareBar } from '../compare/CompareBar'
import { FilesSidebar } from '../files/FilesSidebar'
import { BranchMenu } from '../git/BranchMenu'
import { GitProvider } from '../git/GitProvider'
import { SyncButtons } from '../git/SyncButtons'
import { IssuesSidebar } from '../github/IssuesSidebar'
import { PullsSidebar } from '../github/PullsSidebar'
import { useGitHub } from '../github/SignIn'
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
const FileView = lazy(() => import('../files/FileView'))
const PullView = lazy(() => import('../github/PullView'))
const IssueView = lazy(() => import('../github/IssueView'))

const SHIPPED: View[] = ['changes', 'graph', 'files', 'prs', 'issues']

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

function GitHubTitle({ title }: { title: string }) {
  const { status } = useGitHub()
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <h1>{title}</h1>
      {status?.repo ? <span className="truncate text-muted-foreground">{status.repo}</span> : null}
      {status?.user ? <span className="ms-auto shrink-0 text-muted-foreground">{status.user.login}</span> : null}
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
  // Bumped when a page changes an item, so its list reloads.
  const [pullsVersion, setPullsVersion] = useState(0)
  const [issuesVersion, setIssuesVersion] = useState(0)
  const pullsChanged = () => setPullsVersion((n) => n + 1)
  const issuesChanged = () => setIssuesVersion((n) => n + 1)
  const search = (
    <Button
      size="sm"
      variant="outline"
      className="w-48 shrink-0 justify-start gap-2 text-muted-foreground xl:w-72"
      aria-label="Search files and actions"
      onClick={() => setPalette(true)}>
      <SearchIcon />
      <span className="min-w-0 flex-1 truncate text-start">Search files</span>
      <Kbd className="ms-auto">Ctrl K</Kbd>
    </Button>
  )
  const screens: Record<View, { top: ReactNode; side: ReactNode; label: string; main: ReactNode }> = {
    changes: {
      top: (
        <>
          <BranchMenu />
          <CompareBar />
          {search}
          <CommentsSheet />
          <SyncButtons />
          <SettingsPopover />
        </>
      ),
      side: <Sidebar />,
      label: 'Changed files',
      main: <Viewer />,
    },
    graph: {
      top: (
        <>
          <BranchMenu />
          <GraphTitle />
          {search}
          <SyncButtons />
        </>
      ),
      side: <GraphSidebar />,
      label: 'Branches and tags',
      main: <GraphView />,
    },
    files: {
      top: (
        <>
          <BranchMenu />
          <h1 className="min-w-0 flex-1">Files</h1>
          {search}
          <SyncButtons />
          <SettingsPopover />
        </>
      ),
      side: <FilesSidebar />,
      label: 'All files',
      main: <FileView />,
    },
    prs: {
      top: (
        <>
          <GitHubTitle title="Pull requests" />
          {search}
          <SyncButtons />
        </>
      ),
      side: <PullsSidebar version={pullsVersion} onChanged={pullsChanged} />,
      label: 'Pull requests',
      main: <PullView onChanged={pullsChanged} />,
    },
    issues: {
      top: (
        <>
          <GitHubTitle title="Issues" />
          {search}
          <SyncButtons />
        </>
      ),
      side: <IssuesSidebar version={issuesVersion} onChanged={issuesChanged} />,
      label: 'Issues',
      main: <IssueView onChanged={issuesChanged} />,
    },
  }
  const screen = screens[view]
  return (
    <>
      <Shell
        rail={<ActivityRail views={SHIPPED} />}
        topBar={screen.top}
        sidebar={screen.side}
        sidebarLabel={screen.label}
        viewer={<Suspense fallback={null}>{screen.main}</Suspense>}
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
          <GitProvider>
            <Screen />
            <Toaster position="bottom-right" />
          </GitProvider>
        </WritesProvider>
      </TooltipProvider>
    </AppProvider>
  )
}
