import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { ListRowsSkeleton } from '../app/skeletons'
import { useGit } from '../git/GitProvider'
import { RebaseRows } from './RebaseRows'
import { type PlanRow, planProblem, toRows, toSteps, unchanged } from './rebase-plan'

// Git's rebase todo as a list: drag or move commits to reorder them and pick what happens to each.
export function RebaseDialog({ base, onClose }: { base: string | null; onClose(): void }) {
  const { queries } = useApp()
  const { run, busy } = useGit()
  const plan = useQuery({ ...queries.git.rebasePlan(base ?? ''), enabled: Boolean(base) })
  const commits = plan.data ?? null
  const failed = plan.error ? plan.error.message : null
  const [rows, setRows] = useState<PlanRow[]>([])

  // The rows start as the plan and are the user's to edit from there.
  useEffect(() => {
    if (plan.data) setRows(toRows(plan.data))
  }, [plan.data])

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
        {commits?.length ? <RebaseRows rows={rows} onChange={setRows} /> : null}
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
