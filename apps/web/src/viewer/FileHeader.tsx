import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

const STATUS: Record<FileStatus, string> = {
  added: 'Added',
  untracked: 'New',
  copied: 'Copied',
  modified: 'Modified',
  'type-changed': 'Type changed',
  conflicted: 'Conflict',
  deleted: 'Deleted',
  renamed: 'Renamed',
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
    <div className="flex min-h-12 items-center gap-3 border-border border-b bg-card px-3 font-sans">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={collapsed ? `Show ${path}` : `Hide ${path}`}
        aria-expanded={!collapsed}
        onClick={onToggle}>
        <ChevronRight className={`size-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </Button>
      {file ? (
        <Badge variant={file.status === 'conflicted' ? 'destructive' : 'secondary'} className="text-sm">
          {STATUS[file.status]}
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
