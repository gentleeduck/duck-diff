import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@duck-diff/ui'
import type { ReactNode } from 'react'

interface ShellProps {
  topBar: ReactNode
  sidebar: ReactNode
  viewer: ReactNode
  status: ReactNode
}

export function Shell({ topBar, sidebar, viewer, status }: ShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-[var(--dd-line)] border-b bg-[var(--dd-surface)] px-4">
        {topBar}
      </header>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="22%" minSize="14%" maxSize="45%">
          <nav aria-label="Changed files" className="flex h-full flex-col bg-[var(--dd-surface)]">
            {sidebar}
          </nav>
        </ResizablePanel>
        <ResizableHandle withHandle={false} />
        <ResizablePanel>
          <main className="h-full min-w-0">{viewer}</main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-[var(--dd-line)] border-t bg-[var(--dd-surface)] px-4 text-[12px] text-[var(--dd-muted)]">
        {status}
      </footer>
    </div>
  )
}
