import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@duck-diff/ui'
import type { ReactNode } from 'react'

interface ShellProps {
  rail: ReactNode
  topBar: ReactNode
  // Views that are a single page, like a pull request, have none.
  sidebar: ReactNode | null
  sidebarLabel: string
  viewer: ReactNode
  status: ReactNode
}

export function Shell({ rail, topBar, sidebar, sidebarLabel, viewer, status }: ShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-border border-b bg-card px-4">{topBar}</header>
      <div className="flex min-h-0 flex-1">
        {rail}
        {sidebar === null ? (
          <main className="h-full min-w-0 flex-1">{viewer}</main>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            {/* Pixels, not percent: the tree and commit box need the same room on every screen width. */}
            <ResizablePanel defaultSize="340px" minSize="260px" maxSize="45%">
              <nav aria-label={sidebarLabel} className="flex h-full flex-col bg-card">
                {sidebar}
              </nav>
            </ResizablePanel>
            <ResizableHandle withHandle={false} />
            <ResizablePanel>
              <main className="h-full min-w-0">{viewer}</main>
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
