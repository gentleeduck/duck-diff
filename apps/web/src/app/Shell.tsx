import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@duck-diff/ui'
import { formatForDisplay } from '@gentleduck/vim/format'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useState } from 'react'
import { IconTool } from './IconTool'
import { NavButtons } from './NavButtons'
import { useSidePanel } from './side-panel'

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

const SIDEBAR = { key: 'duck-diff:sidebar-width', initial: 340, min: 300 }

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
  const side = useSidePanel(SIDEBAR)
  // The panel groups measure their panels when they mount, which restyles the whole page; done before the side
  // panel and the page are in it, that costs nothing instead of delaying the first diff. They follow at once,
  // in the same frame.
  const [measured, setMeasured] = useState(false)
  useLayoutEffect(() => setMeasured(true), [])
  return (
    <div className="flex h-full flex-col">
      <header
        data-region="top"
        className="@container/top flex h-12 shrink-0 items-center gap-2 border-border border-b bg-card px-3 @6xl/top:gap-4 @6xl/top:px-4">
        <NavButtons />
        {sidebar !== null && !panelShown ? (
          <IconTool
            label={`Show ${sidebarLabel.toLowerCase()}`}
            tip={`Show ${sidebarLabel.toLowerCase()} (${formatForDisplay('mod+b')})`}
            onClick={onTogglePanel}>
            <PanelLeftOpen />
          </IconTool>
        ) : null}
        {topBar}
      </header>
      {/* One fixed order of children: hiding the side panel or opening the symbol panel never remounts the page. */}
      <div className="flex min-h-0 flex-1">
        {rail}
        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          {shown ? (
            <ResizablePanel id="side" {...side.panel} maxSize="45%" className="flex">
              <nav data-region="side" aria-label={sidebarLabel} className="flex h-full w-full min-w-0 flex-col bg-card">
                <div className="flex h-9 shrink-0 items-center justify-between border-border border-b ps-3 pe-1 text-muted-foreground">
                  <span className="truncate">{sidebarLabel}</span>
                  <IconTool
                    label={`Hide ${sidebarLabel.toLowerCase()}`}
                    tip={`Hide ${sidebarLabel.toLowerCase()} (${formatForDisplay('mod+b')})`}
                    onClick={onTogglePanel}>
                    <PanelLeftClose />
                  </IconTool>
                </div>
                {measured ? sidebar : null}
              </nav>
            </ResizablePanel>
          ) : null}
          {shown ? (
            <ResizableHandle withHandle={false} aria-label="Resize the side panel" onDoubleClick={side.reset} />
          ) : null}
          <ResizablePanel id="page" minSize="25%" className="min-w-0">
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel id="viewer" minSize="20%">
                <main data-region="main" tabIndex={-1} className="h-full w-full outline-none">
                  {measured ? viewer : null}
                </main>
              </ResizablePanel>
              {bottom}
            </ResizablePanelGroup>
          </ResizablePanel>
          {aside}
        </ResizablePanelGroup>
      </div>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-border border-t bg-card px-4 text-muted-foreground">
        {status}
      </footer>
    </div>
  )
}
