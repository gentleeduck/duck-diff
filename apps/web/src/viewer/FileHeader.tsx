import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

const ADDED = 'border-added/40 bg-added/15 text-added'
const CHANGED = 'border-warning/40 bg-warning/15 text-warning'
const REMOVED = 'border-destructive/40 bg-destructive/15 text-destructive'
const MOVED = 'border-tn-magenta/40 bg-tn-magenta/15 text-tn-magenta'

// Soft fills in the status color, so the badge reads at a glance without shouting over the code.
const STATUS: Record<FileStatus, { label: string; tone: string }> = {
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
  children,
}: {
  path: string
  file: ChangedFile | undefined
  collapsed: boolean
  onToggle(): void
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
        <Badge variant="outline" size="sm" className={STATUS[file.status].tone}>
          {STATUS[file.status].label}
        </Badge>
      ) : null}
      <span className="min-w-0 truncate" title={path}>
        {file?.oldPath ? <span className="text-muted-foreground">{file.oldPath} to </span> : null}
        {path}
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
