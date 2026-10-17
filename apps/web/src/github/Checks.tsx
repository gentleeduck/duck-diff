import type { CheckRun } from '@duck-diff/protocol'
import { Badge, type BadgeTone, Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleDashed, CircleMinus, CircleX, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { LinesSkeleton, ListRowsSkeleton } from '../app/skeletons'

type Outcome = 'passed' | 'failed' | 'running' | 'skipped'

const NO_RUNS: CheckRun[] = []

export function outcome(run: CheckRun): Outcome {
  if (run.status !== 'completed') return 'running'
  if (run.conclusion === 'success') return 'passed'
  if (run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'skipped'
  return 'failed'
}

export const LOOK: Record<Outcome, { icon: typeof CircleCheck; className: string; tone: BadgeTone }> = {
  passed: { icon: CircleCheck, className: 'text-added', tone: 'soft-success' },
  failed: { icon: CircleX, className: 'text-removed', tone: 'soft-destructive' },
  running: { icon: CircleDashed, className: 'text-tn-yellow', tone: 'soft-warning' },
  skipped: { icon: CircleMinus, className: 'text-muted-foreground', tone: 'muted' },
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
  const { queries } = useApp()
  const { data, isError } = useQuery(queries.gh.checks(number))
  const runs = isError ? NO_RUNS : (data ?? null)

  if (!runs?.length) return null
  const { look, text } = summary(runs)
  const { icon: Icon, tone } = LOOK[look]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="nothing"
          size="none"
          type="button"
          aria-label={`Checks: ${text}`}
          className="cursor-pointer justify-start rounded-none whitespace-normal">
          <Badge variant={tone} size="sm">
            <Icon className="size-3.5" />
            {text}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <ul>
          {runs.map((run) => {
            const state = LOOK[outcome(run)]
            return (
              <li key={`${run.name}:${run.url}`}>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <a href={run.url || undefined} target="_blank" rel="noreferrer">
                    <state.icon className={`size-4 shrink-0 ${state.className}`} />
                    <span className="min-w-0 flex-1 truncate text-start">{run.name}</span>
                    <Badge variant={state.tone} size="sm">
                      {outcome(run)}
                    </Badge>
                  </a>
                </Button>
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
  const { queries } = useApp()
  const { data, isError } = useQuery(queries.gh.checks(number))
  const runs = isError ? NO_RUNS : (data ?? null)
  if (!runs)
    return (
      <div className="rounded-md border border-border">
        <ListRowsSkeleton count={4} />
      </div>
    )
  if (!runs.length)
    return <p className="p-4 text-muted-foreground">No checks ran on this pull request. Living dangerously.</p>
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
  const { api, queries } = useApp()
  const [open, setOpen] = useState(false)
  const { data: text, error } = useQuery({ ...queries.gh.jobLog(run.jobId ?? 0), enabled: open && run.jobId !== null })
  const log = error ? `Could not read the log: ${error.message}` : (text ?? null)
  const state = LOOK[outcome(run)]
  const failed = outcome(run) === 'failed'
  const toggle = () => {
    setOpen(!open)
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
                () => toast('Re-running the failed jobs', { description: 'This list updates as they finish.' }),
                (error: Error) => toast.error('Could not re-run the failed jobs', { description: error.message }),
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
          {log ?? <LinesSkeleton count={6} className="" />}
        </pre>
      ) : null}
    </li>
  )
}
