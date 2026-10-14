import type { ChangedFile } from '@duck-diff/protocol'
import { ToggleGroup, ToggleGroupItem } from '@duck-diff/ui'
import { countByStatus, type TreeStatus } from './filters'

const LABELS: Record<TreeStatus, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked',
}

interface StatusFilterProps {
  files: readonly ChangedFile[]
  value: ReadonlySet<TreeStatus>
  onChange(next: ReadonlySet<TreeStatus>): void
}

export function StatusFilter({ files, value, onChange }: StatusFilterProps) {
  const counts = countByStatus(files)
  const present = (Object.keys(LABELS) as TreeStatus[]).filter((status) => counts[status])
  if (present.length < 2) return null
  return (
    <ToggleGroup
      type="multiple"
      value={[...value]}
      onValueChange={(next: string[]) => onChange(new Set(next as TreeStatus[]))}
      className="flex flex-wrap justify-start gap-1">
      {present.map((status) => (
        <ToggleGroupItem key={status} value={status} size="sm" className="h-6 px-2">
          {LABELS[status]} <span className="text-muted-foreground tabular-nums">{counts[status]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
