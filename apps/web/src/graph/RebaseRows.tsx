import type { RebaseAction } from '@duck-diff/protocol'
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@duck-diff/ui'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useState } from 'react'
import { IconTool } from '../app/IconTool'
import { ACTIONS, move, type PlanRow } from './rebase-plan'

const TONE: Record<RebaseAction, string> = {
  pick: 'text-foreground',
  reword: 'text-tn-blue',
  edit: 'text-tn-yellow',
  squash: 'text-tn-magenta',
  fixup: 'text-tn-magenta',
  drop: 'text-muted-foreground line-through',
}

// Git's rebase todo as a list: drag or move commits to reorder them and pick what happens to each. Shared by the
// graph's rebase dialog and the window git opens for git rebase -i.
export function RebaseRows({
  rows,
  onChange,
}: {
  rows: PlanRow[]
  onChange(update: (rows: PlanRow[]) => PlanRow[]): void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const update = (index: number, patch: Partial<PlanRow>) =>
    onChange((now) => now.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  const setRows = onChange
  return (
    <ol aria-label="Rebase plan" className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
      {rows.map((row, index) => (
        <li
          key={row.commit.sha}
          draggable
          onDragStart={() => setDragging(index)}
          onDragOver={(event) => {
            event.preventDefault()
            if (dragging !== null && dragging !== index) {
              setRows((now) => move(now, dragging, index))
              setDragging(index)
            }
          }}
          onDragEnd={() => setDragging(null)}
          aria-label={row.commit.subject}
          className={`flex items-center gap-2 border-border border-b px-2 py-1 last:border-b-0 ${dragging === index ? 'bg-accent' : ''}`}>
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
          <Select value={row.action} onValueChange={(next: string) => update(index, { action: next as RebaseAction })}>
            <SelectTrigger aria-label={`Action for ${row.commit.subject}`} className={`h-7 w-28 ${TONE[row.action]}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((action) => (
                <SelectItem key={action.value} value={action.value} title={action.hint}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <code className="shrink-0 text-tn-yellow">{row.commit.sha.slice(0, 7)}</code>
          {row.action === 'reword' ? (
            <Input
              aria-label={`New message for ${row.commit.subject}`}
              value={row.message}
              onChange={(event) => update(index, { message: event.target.value })}
              className="h-7 min-w-0 flex-1"
            />
          ) : (
            <span className={`min-w-0 flex-1 truncate ${TONE[row.action]}`} title={row.commit.subject}>
              {row.commit.subject}
            </span>
          )}
          <span className="hidden shrink-0 text-muted-foreground sm:inline">{row.commit.author}</span>
          <IconTool
            label={`Move ${row.commit.subject} up`}
            disabled={index === 0}
            onClick={() => setRows((now) => move(now, index, index - 1))}>
            <ArrowUp />
          </IconTool>
          <IconTool
            label={`Move ${row.commit.subject} down`}
            disabled={index === rows.length - 1}
            onClick={() => setRows((now) => move(now, index, index + 1))}>
            <ArrowDown />
          </IconTool>
        </li>
      ))}
    </ol>
  )
}
