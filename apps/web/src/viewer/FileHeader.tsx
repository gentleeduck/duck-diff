import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import { Badge, type BadgeTone, Button } from '@duck-diff/ui'
import { ChevronRight, GitMerge } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../app/AppProvider'
import { useView } from '../hooks/useView'
import { openMerge } from '../merge/open-merge'

const ADDED = 'soft-success'
const CHANGED = 'soft-warning'
const REMOVED = 'soft-destructive'
const MOVED = 'soft-done'

function ResolveButton({ path }: { path: string }) {
  const app = useApp()
  const { show } = useView()
  return (
    <Button size="sm" variant="outline" aria-label={`Resolve ${path}`} onClick={() => openMerge(app, show, path)}>
      <GitMerge />
      Resolve
    </Button>
  )
}

// Soft fills in the status color, so the badge reads at a glance without shouting over the code.
const STATUS: Record<FileStatus, { label: string; tone: BadgeTone }> = {
  added: { label: 'Added', tone: ADDED },
  untracked: { label: 'New', tone: ADDED },
  copied: { label: 'Copied', tone: ADDED },
  modified: { label: 'Modified', tone: CHANGED },
  'type-changed': { label: 'Type changed', tone: CHANGED },
  conflicted: { label: 'Conflict', tone: REMOVED },
  deleted: { label: 'Deleted', tone: REMOVED },
  renamed: { label: 'Renamed', tone: MOVED },
}

// Replaces the diff library's own header so every file starts with duck-ui controls.
export function FileHeader({
  path,
  file,
  collapsed,
  onToggle,
  onOpen,
  children,
}: {
  path: string
  file: ChangedFile | undefined
  collapsed: boolean
  onToggle(): void
  // Opens the file in the Files view; absent where the checkout does not hold this version.
  onOpen?(): void
  children: ReactNode
}) {
  return (
    <div className="flex h-11 items-center gap-3 border-border border-b bg-card px-3 font-sans">
      <Button
        variant="ghost"
        size="icon"
        aria-label={collapsed ? `Show ${path}` : `Hide ${path}`}
        aria-expanded={!collapsed}
        onClick={onToggle}>
        <ChevronRight className={`size-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </Button>
      {file ? (
        <Badge variant={STATUS[file.status].tone} size="sm">
          {STATUS[file.status].label}
        </Badge>
      ) : null}
      {file?.status === 'conflicted' ? <ResolveButton path={file.path} /> : null}
      <span className="min-w-0 truncate" title={onOpen ? `Open ${path} in Files` : path}>
        {file?.oldPath ? <span className="text-muted-foreground">{file.oldPath} to </span> : null}
        {onOpen ? (
          <Button
            variant="nothing"
            size="none"
            type="button"
            onClick={onOpen}
            className="inline rounded-none hover:text-tn-blue hover:underline">
            {path}
          </Button>
        ) : (
          path
        )}
      </span>
      {file && file.additions !== null && file.deletions !== null ? (
        <span className="shrink-0 tabular-nums">
          <span className="text-added">+{file.additions}</span> <span className="text-removed">-{file.deletions}</span>
        </span>
      ) : null}
      <span className="ms-auto">{children}</span>
    </div>
  )
}
