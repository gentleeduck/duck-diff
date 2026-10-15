import type { CheckRun } from '@duck-diff/protocol'
import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { CircleCheck, CircleDashed, CircleMinus, CircleX, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'

type Outcome = 'passed' | 'failed' | 'running' | 'skipped'

export function outcome(run: CheckRun): Outcome {
  if (run.status !== 'completed') return 'running'
  if (run.conclusion === 'success') return 'passed'
  if (run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'skipped'
  return 'failed'
}

export const LOOK: Record<Outcome, { icon: typeof CircleCheck; className: string }> = {
  passed: { icon: CircleCheck, className: 'text-added' },
  failed: { icon: CircleX, className: 'text-removed' },
  running: { icon: CircleDashed, className: 'text-tn-yellow' },
  skipped: { icon: CircleMinus, className: 'text-muted-foreground' },
}

// The badge shows the worst state: one failure outweighs any number of passes.
function summary(runs: CheckRun[]): { look: Outcome; text: string } {
  const count = (state: Outcome) => runs.filter((run) => outcome(run) === state).length
  const failed = count('failed')
  if (failed) return { look: 'failed', text: `${failed} failing` }
  const running = count('running')
  if (running) return { look: 'running', text: `${running} running` }
  return { look: 'passed', text: `${count('passed')} passed` }
}

export function Checks({ number }: { number: number }) {
  const { api } = useApp()
  const [runs, setRuns] = useState<CheckRun[] | null>(null)

  useEffect(() => {
    let alive = true
    api.github.checks(number).then(
      (next) => alive && setRuns(next),
      () => alive && setRuns([]),
    )
    return () => {
      alive = false
    }
  }, [api, number])

  if (!runs?.length) return null
  const { look, text } = summary(runs)
  const { icon: Icon, className } = LOOK[look]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Checks: ${text}`} className="cursor-pointer">
          <Badge variant="outline" size="sm" className={className}>
            <Icon className="size-3.5" />
            {text}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <ul>
          {runs.map((run) => {
            const state = LOOK[outcome(run)]
            return (
              <li key={`${run.name}:${run.url}`}>
                <a
                  href={run.url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent">
                  <state.icon className={`size-4 shrink-0 ${state.className}`} />
                  <span className="min-w-0 flex-1 truncate">{run.name}</span>
                  <span className="text-muted-foreground">{outcome(run)}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// Every run on the head commit, for the pull request's Checks tab.
export function ChecksList({ number }: { number: number }) {
  const { api } = useApp()
  const [runs, setRuns] = useState<CheckRun[] | null>(null)
  useEffect(() => {
    let alive = true
    api.github.checks(number).then(
      (next) => alive && setRuns(next),
      () => alive && setRuns([]),
    )
    return () => {
      alive = false
    }
  }, [api, number])
  if (!runs) return <p className="p-4 text-muted-foreground">Reading checks...</p>
  if (!runs.length) return <p className="p-4 text-muted-foreground">No checks ran on this pull request.</p>
  const { text } = summary(runs)
  return (
    <section aria-label="Checks" className="rounded-md border border-border">
      <h3 className="border-border border-b bg-card px-4 py-2 text-foreground">{text}</h3>
      <ul>
        {runs.map((run) => (
          <CheckRow key={`${run.name}:${run.url}`} run={run} />
        ))}
      </ul>
    </section>
  )
}

// A failed Actions job opens to the end of its log and can run again, as on GitHub's Checks tab.
function CheckRow({ run }: { run: CheckRun }) {
  const { api } = useApp()
  const [log, setLog] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const state = LOOK[outcome(run)]
  const failed = outcome(run) === 'failed'
  const toggle = () => {
    setOpen(!open)
    if (!open && log === null && run.jobId !== null)
      api.github.jobLog(run.jobId).then(setLog, (error: Error) => setLog(`Could not read the log: ${error.message}`))
  }
  return (
    <li className="border-border border-b last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2">
        <state.icon className={`size-4 shrink-0 ${state.className}`} />
        <span className="min-w-0 flex-1 truncate text-foreground">{run.name}</span>
        <span className="text-muted-foreground">{outcome(run)}</span>
        {failed && run.jobId !== null ? (
          <Button size="sm" variant="ghost" onClick={toggle}>
            {open ? 'Hide log' : 'Show log'}
          </Button>
        ) : null}
        {failed && run.runId !== null ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              api.github.rerunFailed(run.runId as number).then(
                () => toast('Re-running the failed jobs'),
                (error: Error) => toast.error(error.message),
              )
            }>
            <RotateCw />
            Re-run failed
          </Button>
        ) : null}
        {run.url ? (
          <a href={run.url} target="_blank" rel="noreferrer" className="text-tn-blue hover:underline">
            Details
          </a>
        ) : null}
      </div>
      {open ? (
        <pre className="max-h-96 overflow-auto border-border border-t bg-tn-dark px-4 py-2 text-muted-foreground">
          {log ?? 'Reading the log...'}
        </pre>
      ) : null}
    </li>
  )
}
