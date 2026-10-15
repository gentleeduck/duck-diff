import { Button, Kbd, Toaster, TooltipProvider } from '@duck-diff/ui'
import { SearchIcon } from 'lucide-react'
import { lazy, memo, type ReactNode, Suspense, useState } from 'react'
import { SymbolPanel } from '../code-nav/SymbolPanel'
import { CompareBar } from '../compare/CompareBar'
import { FilesSidebar } from '../files/FilesSidebar'
import { BranchMenu } from '../git/BranchMenu'
import { GitProvider } from '../git/GitProvider'
import { SyncButtons } from '../git/SyncButtons'
import { useUnread } from '../github/Inbox'
import { useGitHub } from '../github/SignIn'
import { FindCommit } from '../graph/FindCommit'
import { GraphSidebar } from '../graph/GraphSidebar'
import type { GraphState } from '../graph/store'
import { useSettings } from '../hooks/useSettings'
import { useUrlSync } from '../hooks/useUrlSync'
import { useView } from '../hooks/useView'
import { HelpDialog } from '../keyboard/HelpDialog'
import { useKeyboard } from '../keyboard/useKeyboard'
import type { Api } from '../lib/api'
import { useStore } from '../lib/store'
import type { View } from '../lib/view-url'
import { useDesktopNotices } from '../live/useDesktopNotices'
import { useLiveRefresh } from '../live/useLiveRefresh'
import { MergeSidebar } from '../merge/MergeSidebar'
import { Palette } from '../palette/Palette'
import { CommentsSheet } from '../review/CommentsSheet'
import { SettingsPopover } from '../settings/SettingsPopover'
import { Sidebar } from '../sidebar/Sidebar'
import type { Settings } from '../state/settings'
import { WritesProvider } from '../writes/WritesProvider'
import { ActivityRail } from './ActivityRail'
import { AppProvider, useApp } from './AppProvider'
import { AskDialog } from './Ask'
import { Shell } from './Shell'
import { StatusBar } from './StatusBar'
import { useSizes } from './useSizes'
import { useThemeClass } from './useThemeClass'

// Memoized: the page around them re-renders for panels and badges, which these big views do not need.
const Viewer = lazy(() => import('../viewer/Viewer').then((module) => ({ default: memo(module.default) })))
const GraphView = lazy(() => import('../graph/GraphView').then((module) => ({ default: memo(module.default) })))
const MergeEditor = lazy(() => import('../merge/MergeEditor'))
const FileView = lazy(() => import('../files/FileView').then((module) => ({ default: memo(module.default) })))
// GitHub pages load when first opened, keeping them out of the bundle every view waits for.
const pages = () => import('../github/Pages')
const PullsPage = lazy(() => pages().then((module) => ({ default: module.PullsPage })))
const IssuesPage = lazy(() => pages().then((module) => ({ default: module.IssuesPage })))
const InboxPage = lazy(() => pages().then((module) => ({ default: module.InboxPage })))
const ReleasesPage = lazy(() => pages().then((module) => ({ default: module.ReleasesPage })))
const ActionsPage = lazy(() => pages().then((module) => ({ default: module.ActionsPage })))

const SHIPPED: View[] = ['changes', 'graph', 'files', 'prs', 'issues', 'inbox', 'releases', 'actions']

const selectCommitCount = (state: GraphState) => state.entries.length
const selectPanel = (state: Settings) => state.sidebar

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
  useSizes()
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const { view, show } = useView()
  useKeyboard({ palette: () => setPalette(true), help: () => setHelp(true), show })
  const live = useLiveRefresh()
  useDesktopNotices()
  useUrlSync()
  // Bumped when a page changes an item, so its list reloads.
  const [pullsVersion, setPullsVersion] = useState(0)
  const [issuesVersion, setIssuesVersion] = useState(0)
  const { items } = useApp()
  // A change made here is a change the palette's saved list should see too.
  const pullsChanged = () => {
    setPullsVersion((n) => n + 1)
    void items.refresh()
  }
  const issuesChanged = () => {
    setIssuesVersion((n) => n + 1)
    void items.refresh()
  }
  const search = (
    <Button
      size="sm"
      variant="outline"
      className="w-48 shrink-0 justify-start gap-2 text-muted-foreground xl:w-72"
      aria-label="Search files and actions"
      onClick={() => setPalette(true)}>
      <SearchIcon />
      <span className="min-w-0 flex-1 truncate text-start">Search or jump to...</span>
      <Kbd className="ms-auto">Ctrl K</Kbd>
    </Button>
  )
  const screens: Record<View, { top: ReactNode; side: ReactNode | null; label: string; main: ReactNode }> = {
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
          <FindCommit />
          <SyncButtons />
          <SettingsPopover />
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
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Pull requests',
      main: <PullsPage version={pullsVersion} onChanged={pullsChanged} />,
    },
    issues: {
      top: (
        <>
          <GitHubTitle title="Issues" />
          {search}
          <SyncButtons />
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Issues',
      main: <IssuesPage version={issuesVersion} onChanged={issuesChanged} />,
    },
    inbox: {
      top: (
        <>
          <GitHubTitle title="Notifications" />
          {search}
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Notifications',
      main: <InboxPage />,
    },
    releases: {
      top: (
        <>
          <GitHubTitle title="Releases" />
          {search}
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Releases',
      main: <ReleasesPage />,
    },
    actions: {
      top: (
        <>
          <GitHubTitle title="Actions" />
          {search}
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Actions',
      main: <ActionsPage />,
    },
    merge: {
      top: (
        <>
          <BranchMenu />
          <h1 className="min-w-0 flex-1">Resolve conflicts</h1>
          {search}
          <SettingsPopover />
        </>
      ),
      side: <MergeSidebar />,
      label: 'Conflicted files',
      main: <MergeEditor />,
    },
  }
  const screen = screens[view]
  const panel = useSettings(selectPanel)
  const unread = useUnread()
  const { settings } = useApp()
  const togglePanel = () => settings.set((prev) => ({ ...prev, sidebar: !prev.sidebar }))
  return (
    <>
      <Shell
        rail={<ActivityRail views={SHIPPED} badges={{ inbox: unread }} />}
        topBar={screen.top}
        sidebar={screen.side}
        sidebarLabel={screen.label}
        panelShown={panel}
        onTogglePanel={togglePanel}
        viewer={<Suspense fallback={null}>{screen.main}</Suspense>}
        aside={<SymbolPanel />}
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
            <AskDialog />
            <Toaster position="bottom-right" />
          </GitProvider>
        </WritesProvider>
      </TooltipProvider>
    </AppProvider>
  )
}
