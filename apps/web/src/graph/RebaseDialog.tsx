import type { RebaseAction } from '@duck-diff/protocol'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { ListRowsSkeleton } from '../app/skeletons'
import { useGit } from '../git/GitProvider'
import { ACTIONS, move, type PlanRow, planProblem, toRows, toSteps, unchanged } from './rebase-plan'

const TONE: Record<RebaseAction, string> = {
  pick: 'text-foreground',
  reword: 'text-tn-blue',
  edit: 'text-tn-yellow',
  squash: 'text-tn-magenta',
  fixup: 'text-tn-magenta',
  drop: 'text-muted-foreground line-through',
}

// Git's rebase todo as a list: drag or move commits to reorder them and pick what happens to each.
export function RebaseDialog({ base, onClose }: { base: string | null; onClose(): void }) {
  const { queries } = useApp()
  const { run, busy } = useGit()
  const plan = useQuery({ ...queries.git.rebasePlan(base ?? ''), enabled: Boolean(base) })
  const commits = plan.data ?? null
  const failed = plan.error ? plan.error.message : null
  const [rows, setRows] = useState<PlanRow[]>([])
  const [dragging, setDragging] = useState<number | null>(null)

  // The rows start as the plan and are the user's to edit from there.
  useEffect(() => {
    if (plan.data) setRows(toRows(plan.data))
  }, [plan.data])

  const update = (index: number, patch: Partial<PlanRow>) =>
    setRows((now) => now.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  const problem = planProblem(rows)
  const start = async () => {
    if (!base || problem) return
    if (await run('rebase-interactive', { base, steps: toSteps(rows) }, 'Rebased')) onClose()
  }

  return (
    <Dialog open={base !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogTitle>Rebase onto {base?.slice(0, 7)}</DialogTitle>
        <DialogDescription>
          Oldest first, as git replays them. Squash and fixup fold a commit into the one above it.
        </DialogDescription>
        {failed ? <p className="text-removed">{failed}</p> : null}
        {!commits && !failed ? <ListRowsSkeleton count={4} py="py-1" /> : null}
        {commits && !commits.length ? (
          <p className="text-muted-foreground">No commits after this one on the current branch.</p>
        ) : null}
        {commits?.length ? (
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
                <Select
                  value={row.action}
                  onValueChange={(next: string) => update(index, { action: next as RebaseAction })}>
                  <SelectTrigger
                    aria-label={`Action for ${row.commit.subject}`}
                    className={`h-7 w-28 ${TONE[row.action]}`}>
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
        ) : null}
        <DialogFooter className="items-center">
          {problem && commits?.length ? <p className="me-auto text-warning">{problem}</p> : null}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!commits?.length || Boolean(problem) || (commits ? unchanged(rows, commits) : true)}
            loading={busy === 'rebase-interactive'}
            onClick={() => void start()}>
            Start rebase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
