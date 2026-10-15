import type { ChangedFile } from '@duck-diff/protocol'
import { ToggleGroup, ToggleGroupItem } from '@duck-diff/ui'
import { countByStatus, type TreeStatus } from './filters'

// Git's own letters on a narrow side panel, the full word once there is room.
const LABELS: Record<TreeStatus, { word: string; letter: string; color: string }> = {
  added: { word: 'Added', letter: 'A', color: 'text-tn-green' },
  modified: { word: 'Modified', letter: 'M', color: 'text-tn-yellow' },
  deleted: { word: 'Deleted', letter: 'D', color: 'text-tn-red' },
  renamed: { word: 'Renamed', letter: 'R', color: 'text-tn-blue' },
  untracked: { word: 'Untracked', letter: 'U', color: 'text-tn-green' },
}

interface StatusFilterProps {
  files: readonly ChangedFile[]
  value: ReadonlySet<TreeStatus>
  onChange(next: ReadonlySet<TreeStatus>): void
}

// One line across the side panel: each status a segment of equal share, sized by the panel, never wrapping.
export function StatusFilter({ files, value, onChange }: StatusFilterProps) {
  const counts = countByStatus(files)
  const present = (Object.keys(LABELS) as TreeStatus[]).filter((status) => counts[status])
  if (present.length < 2) return null
  return (
    <ToggleGroup
      type="multiple"
      aria-label="Show only"
      value={[...value]}
      onValueChange={(next: string[]) => onChange(new Set(next as TreeStatus[]))}
      className="flex w-full flex-nowrap gap-1">
      {present.map((status) => {
        const label = LABELS[status]
        return (
          <ToggleGroupItem
            key={status}
            value={status}
            variant="outline"
            aria-label={`${label.word} ${counts[status]}`}
            title={`${label.word}: ${counts[status]}`}
            className="h-7 min-w-0 flex-1 justify-center gap-1.5 whitespace-nowrap px-1.5">
            <span className={label.color}>
              <span className="@[22rem]/side:hidden">{label.letter}</span>
              <span className="hidden @[22rem]/side:inline">{label.word}</span>
            </span>
            <span className="truncate text-muted-foreground tabular-nums">{counts[status]}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
