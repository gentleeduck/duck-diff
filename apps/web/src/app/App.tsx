import { Button, Kbd, Toaster, TooltipProvider } from '@duck-diff/ui'
import { formatForDisplay } from '@gentleduck/vim/format'
import { RouterProvider } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'
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
import { useView } from '../hooks/useView'
import { ShortcutsDialog } from '../keys/ShortcutsDialog'
import { useShortcuts } from '../keys/useShortcuts'
import type { Api } from '../lib/api'
import { useStore } from '../lib/store'
import { useDesktopNotices } from '../live/useDesktopNotices'
import { useLiveRefresh } from '../live/useLiveRefresh'
import { MergeSidebar } from '../merge/MergeSidebar'
import { Palette } from '../palette/Palette'
import { BottomPanel } from '../panel/BottomPanel'
import { CommentsSheet } from '../review/CommentsSheet'
import type { Place, View } from '../router/place'
import { createAppRouter } from '../router/router'
import { SettingsPopover } from '../settings/SettingsPopover'
import { Sidebar } from '../sidebar/Sidebar'
import { panelShown, type Settings, togglePanel } from '../state/settings'
import { WritesProvider } from '../writes/WritesProvider'
import { ActivityRail } from './ActivityRail'
import { AppProvider, useApp } from './AppProvider'
import { AskDialog } from './Ask'
import { ScrollKeeper } from './ScrollKeeper'
import { Shell } from './Shell'
import { StatusBar } from './StatusBar'
import { TruncationTooltip } from './TruncationTooltip'
import { useSizes } from './useSizes'
import { useThemeClass } from './useThemeClass'
import { ViewStack } from './ViewStack'

const SHIPPED: View[] = [
  'changes',
  'graph',
  'files',
  'prs',
  'issues',
  'inbox',
  'releases',
  'actions',
  'discussions',
  'security',
  'insights',
]

const selectCommitCount = (state: GraphState) => state.entries.length
const selectNumber = (place: Place) => place.number

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
  const { view } = useView()
  const item = useStore(useApp().place, selectNumber) !== null
  useShortcuts({ palette: () => setPalette(true), shortcuts: () => setHelp(true) })
  const live = useLiveRefresh()
  useDesktopNotices()
  const search = (
    <Button
      size="sm"
      variant="outline"
      className="size-7 shrink-0 justify-start gap-2 px-0! text-muted-foreground @max-6xl/top:justify-center @6xl/top:w-48 @6xl/top:ps-2! @6xl/top:pe-1! @7xl/top:w-80"
      aria-label="Search files and actions"
      title={`Search files and actions (${formatForDisplay('mod+p')})`}
      onClick={() => setPalette(true)}>
      <Search />
      <span className="hidden min-w-0 flex-1 truncate text-start @6xl/top:inline">Search or jump to...</span>
      <Kbd className="ms-auto hidden h-[1.125rem] px-1 text-[0.8em] leading-none @6xl/top:inline-flex" keys="mod+p" />
    </Button>
  )
  const screens: Record<View, { top: ReactNode; side: ReactNode | null; label: string }> = {
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
    },
    discussions: {
      top: (
        <>
          <GitHubTitle title="Discussions" />
          {search}
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Discussions',
    },
    security: {
      top: (
        <>
          <GitHubTitle title="Security" />
          {search}
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Security',
    },
    insights: {
      top: (
        <>
          <BranchMenu />
          <h1 className="min-w-0 flex-1">Insights</h1>
          {search}
          <SettingsPopover />
        </>
      ),
      side: null,
      label: 'Insights',
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
    },
  }
  const screen = screens[view]
  const panel = useSettings(useCallback((state: Settings) => panelShown(state, view), [view]))
  const unread = useUnread()
  const { settings } = useApp()
  const flipPanel = () => settings.set((prev) => togglePanel(prev, view))
  return (
    <>
      <Shell
        rail={<ActivityRail views={SHIPPED} badges={{ inbox: unread }} onShortcuts={() => setHelp(true)} />}
        topBar={screen.top}
        sidebar={screen.side}
        sidebarLabel={screen.label}
        panelShown={panel}
        onTogglePanel={flipPanel}
        viewer={<ViewStack view={view} item={item} />}
        // The symbol panel belongs to the code views; other pages never show it.
        aside={view === 'changes' || view === 'files' ? <SymbolPanel /> : null}
        bottom={<BottomPanel />}
        status={<StatusBar live={live} />}
      />
      <Palette open={palette} onOpenChange={setPalette} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      <TruncationTooltip />
      <ScrollKeeper view={view} />
    </>
  )
}

// The router renders the page; its history is the one the place stores read (AppProvider).
function Routed() {
  const { history } = useApp()
  const [router] = useState(() => createAppRouter(history, Screen))
  return <RouterProvider router={router} />
}

export function App({ api, persist = false }: { api?: Api; persist?: boolean }) {
  return (
    <AppProvider api={api} persist={persist}>
      <TooltipProvider>
        <WritesProvider>
          <GitProvider>
            <Routed />
            <AskDialog />
            {/* Every theme is dark; sonner would otherwise follow the system's light or dark. */}
            <Toaster position="bottom-right" theme="dark" style={{ '--width': '28rem' } as React.CSSProperties} />
          </GitProvider>
        </WritesProvider>
      </TooltipProvider>
    </AppProvider>
  )
}
