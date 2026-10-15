import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@duck-diff/ui'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconTool } from './IconTool'
import { NavButtons } from './NavButtons'

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
  status: ReactNode
}

export function Shell({
  rail,
  topBar,
  sidebar,
  sidebarLabel,
  panelShown,
  onTogglePanel,
  viewer,
  aside,
  status,
}: ShellProps) {
  const shown = sidebar !== null && panelShown
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-border border-b bg-card px-4">
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
      <div className="flex min-h-0 flex-1">
        {rail}
        {!shown ? (
          <>
            <main className="h-full min-w-0 flex-1">{viewer}</main>
            {aside}
          </>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            {/* Pixels, not percent: the tree and commit box need the same room on every screen width. */}
            <ResizablePanel defaultSize="340px" minSize="260px" maxSize="45%">
              <nav aria-label={sidebarLabel} className="flex h-full flex-col bg-card">
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
            </ResizablePanel>
            <ResizableHandle withHandle={false} />
            <ResizablePanel>
              <div className="flex h-full min-w-0">
                <main className="h-full min-w-0 flex-1">{viewer}</main>
                {aside}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-border border-t bg-card px-4 text-muted-foreground">
        {status}
      </footer>
    </div>
  )
}
