import type { Job } from '@duck-diff/protocol'
import { Check, LoaderCircle, X } from 'lucide-react'
import { useCallback } from 'react'
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
export function OutputView() {
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
      <ul aria-label="Actions" className="w-80 shrink-0 overflow-y-auto border-border border-e">
        {list.map((job) => (
          <li key={job.id}>
            <button
              type="button"
              aria-current={job.id === id}
              onClick={() => panel.show('output', job.id)}
              className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-start ${
                job.id === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40'
              }`}>
              <StatusIcon status={job.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{job.title}</span>
                <span className="block truncate opacity-70">{job.command}</span>
              </span>
              <span className="shrink-0 text-end opacity-70">
                <span className="block">{relativeTime(job.startedAt / 1000)}</span>
                <span className="block">{took(job)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1">
        <TerminalSurface key={id} label={`Output of ${shown.title}`} readOnly attach={attach} />
      </div>
    </div>
  )
}
