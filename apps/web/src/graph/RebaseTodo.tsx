import type { ToolSpec } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { RebaseRows } from './RebaseRows'
import { type PlanRow, planProblem, toSteps } from './rebase-plan'

// git rebase -i's todo, opened in duck-diff (duck-diff rebase-todo is git's sequence editor): the commits git is
// about to replay, to reorder and pick for, then handed back for git to run.
export function RebaseTodo({ spec, actions }: { spec: Extract<ToolSpec, { kind: 'rebase' }>; actions?: ReactNode }) {
  const { api } = useApp()
  const [rows, setRows] = useState<PlanRow[]>(() =>
    spec.steps.map((step) => ({ commit: step.commit, action: step.action, message: step.commit.subject })),
  )
  const [busy, setBusy] = useState<'start' | 'cancel' | null>(null)
  const problem = planProblem(rows)
  const finish = async (ok: boolean) => {
    setBusy(ok ? 'start' : 'cancel')
    try {
      await api.finishTool({ id: spec.id, ok, ...(ok ? { steps: toSteps(rows) } : {}) })
    } catch (error) {
      toast.error('git did not take the plan', { description: (error as Error).message })
      setBusy(null)
    }
  }
  return (
    <section aria-label="Rebase plan for git" className="mx-auto flex h-full w-full max-w-4xl flex-col gap-3 p-6">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-foreground">git rebase -i</h1>
          <p className="text-muted-foreground">
            Oldest first, as git replays them. Squash and fixup fold a commit into the one above it.
          </p>
        </div>
        {actions}
      </div>
      {rows.length ? (
        // Not a flex child, so the list is as tall as its commits rather than the window.
        <div className="min-h-0 overflow-y-auto">
          <RebaseRows rows={rows} onChange={setRows} />
        </div>
      ) : (
        <p className="text-muted-foreground">Nothing to replay.</p>
      )}
      <div className="flex items-center gap-2">
        {problem && rows.length ? <p className="me-auto text-warning">{problem}</p> : <span className="me-auto" />}
        <Button size="sm" variant="ghost" loading={busy === 'cancel'} onClick={() => void finish(false)}>
          Cancel the rebase
        </Button>
        <Button
          size="sm"
          disabled={!rows.length || Boolean(problem)}
          loading={busy === 'start'}
          onClick={() => void finish(true)}>
          Start rebase
        </Button>
      </div>
    </section>
  )
}
