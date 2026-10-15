import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconTool } from './IconTool'
import { NavButtons } from './NavButtons'
import { ResizeHandle, useStoredWidth } from './ResizeHandle'

interface ShellProps {
  rail: ReactNode
  topBar: ReactNode
  // Views that are a single page, like a pull request, have none.
  sidebar: ReactNode | null
  sidebarLabel: string
  // The view's panel can be hidden for a wider page; views without one never show the toggle.
  panelShown: boolean
  onTogglePanel(): void
  viewer: ReactNode
  // A panel docked on the right of the page, like the symbol panel; null when closed.
  aside?: ReactNode
  // The output and terminal panel under the page; null when closed.
  bottom?: ReactNode
  status: ReactNode
}

const SIDEBAR = { key: 'duck-diff:sidebar-width', initial: 340, min: 260, maxShare: 0.45 }

export function Shell({
  rail,
  topBar,
  sidebar,
  sidebarLabel,
  panelShown,
  onTogglePanel,
  viewer,
  aside,
  bottom,
  status,
}: ShellProps) {
  const shown = sidebar !== null && panelShown
  const [width, setWidth] = useStoredWidth(SIDEBAR)
  return (
    <div className="flex h-full flex-col">
      <header className="@container/top flex h-12 shrink-0 items-center gap-2 border-border border-b bg-card px-3 @6xl/top:gap-4 @6xl/top:px-4">
        <NavButtons />
        {sidebar !== null && !panelShown ? (
          <IconTool
            label={`Show ${sidebarLabel.toLowerCase()}`}
            tip={`Show ${sidebarLabel.toLowerCase()} (Ctrl B)`}
            onClick={onTogglePanel}>
            <PanelLeftOpen />
          </IconTool>
        ) : null}
        {topBar}
      </header>
      {/* One fixed order of children: hiding the side panel or opening the symbol panel never remounts the page. */}
      <div className="flex min-h-0 flex-1">
        {rail}
        {shown ? (
          <nav
            data-region="side"
            aria-label={sidebarLabel}
            style={{ width }}
            className="flex h-full shrink-0 flex-col bg-card">
            <div className="flex h-9 shrink-0 items-center justify-between border-border border-b ps-3 pe-1 text-muted-foreground">
              <span className="truncate">{sidebarLabel}</span>
              <IconTool
                label={`Hide ${sidebarLabel.toLowerCase()}`}
                tip={`Hide ${sidebarLabel.toLowerCase()} (Ctrl B)`}
                onClick={onTogglePanel}>
                <PanelLeftClose />
              </IconTool>
            </div>
            {sidebar}
          </nav>
        ) : null}
        {shown ? (
          <ResizeHandle
            label="Resize the side panel"
            width={width}
            initial={SIDEBAR.initial}
            side="left"
            onResize={setWidth}
          />
        ) : null}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <main data-region="main" tabIndex={-1} className="min-h-0 w-full flex-1 outline-none">
            {viewer}
          </main>
          {bottom}
        </div>
        {aside}
      </div>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-border border-t bg-card px-4 text-muted-foreground">
        {status}
      </footer>
    </div>
  )
}
