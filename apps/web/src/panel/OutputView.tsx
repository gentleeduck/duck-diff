import type { Job } from '@duck-diff/protocol'
import { Check, LoaderCircle, X } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { relativeTime } from '../sidebar/relative-time'
import { TerminalSurface } from '../terminal/TerminalSurface'
import type { Terminal } from '../terminal/xterm'
import type { JobsState } from './jobs'
import type { PanelState } from './panel'

const selectJobs = (state: JobsState) => state.jobs
const selectJob = (state: PanelState) => state.job

const took = (job: Job) => (job.endedAt ? `${((job.endedAt - job.startedAt) / 1000).toFixed(1)}s` : 'running')

function StatusIcon({ status }: { status: Job['status'] }) {
  if (status === 'running')
    return <LoaderCircle aria-label="Running" className="size-4 shrink-0 animate-spin text-tn-blue" />
  if (status === 'ok') return <Check aria-label="Done" className="size-4 shrink-0 text-tn-green" />
  return <X aria-label="Failed" className="size-4 shrink-0 text-tn-red" />
}

// Every action the page ran, newest first, with the commands it typed and what they printed.
export const OutputView = memo(function OutputView() {
  const { jobs, panel } = useApp()
  const list = useStore(jobs, selectJobs)
  const chosen = useStore(panel, selectJob)
  const shown = list.find((job) => job.id === chosen) ?? list[0] ?? null
  const id = shown?.id ?? null

  const attach = useCallback(
    (terminal: Terminal) => (id ? jobs.follow(id, (data) => terminal.write(data)) : () => {}),
    [jobs, id],
  )

  if (!shown) {
    return (
      <p className="p-4 text-muted-foreground">
        Commits, pushes and every other git action show the commands they run and their output here, hooks included.
      </p>
    )
  }
  return (
    <div className="flex h-full min-h-0">
      <ul aria-label="Actions" className="w-96 max-w-[45%] shrink-0 overflow-y-auto border-border border-e py-1">
        {list.map((job) => (
          <li key={job.id}>
            <button
              type="button"
              aria-current={job.id === id}
              title={`${job.command}, ${relativeTime(job.startedAt / 1000)}`}
              onClick={() => panel.show('output', job.id)}
              className={`flex h-7 w-full cursor-pointer items-center gap-2 px-3 text-start ${
                job.id === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40'
              }`}>
              <StatusIcon status={job.status} />
              <span className="shrink-0 text-foreground">{job.title}</span>
              <span className="min-w-0 flex-1 truncate pe-0.5 opacity-70">
                {job.command === job.title ? '' : job.command}
              </span>
              <span className="shrink-0 tabular-nums opacity-70">{took(job)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1">
        <TerminalSurface key={id} label={`Output of ${shown.title}`} readOnly attach={attach} />
      </div>
    </div>
  )
})
