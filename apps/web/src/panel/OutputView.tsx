import type { Job } from '@duck-diff/protocol'
import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@duck-diff/ui'
import { Check, ListX, LoaderCircle, X } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useSidePanel } from '../app/side-panel'
import { useStore } from '../lib/store'
import { relativeTime } from '../sidebar/relative-time'
import { TerminalSurface } from '../terminal/TerminalSurface'
import type { Terminal } from '../terminal/xterm'
import type { JobsState } from './jobs'
import type { PanelState } from './panel'

const LIST = { key: 'duck-diff:output-list-width', initial: 384, min: 220 }

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
  const side = useSidePanel(LIST)

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
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel id="actions" {...side.panel} maxSize="60%" className="flex flex-col">
        <div className="flex h-7 shrink-0 items-center justify-between border-border border-b ps-3 pe-1 text-muted-foreground">
          <span>{list.length === 1 ? '1 action' : `${list.length} actions`}</span>
          <IconTool label="Clear the list" onClick={() => void jobs.clear().then(() => panel.show('output', null))}>
            <ListX />
          </IconTool>
        </div>
        <ul aria-label="Actions" className="min-h-0 flex-1 overflow-y-auto py-1">
          {list.map((job) => (
            <li key={job.id}>
              <Button
                variant="nothing"
                size="none"
                type="button"
                aria-current={job.id === id}
                title={`${job.command}, ${relativeTime(job.startedAt / 1000)}`}
                onClick={() => panel.show('output', job.id)}
                className={`flex h-7 w-full cursor-pointer items-center gap-2 px-3 text-start ${
                  job.id === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40'
                } justify-start rounded-none`}>
                <StatusIcon status={job.status} />
                <span className="shrink-0 text-foreground">{job.title}</span>
                <span className="min-w-0 flex-1 truncate pe-0.5 opacity-70">
                  {job.command === job.title ? '' : job.command}
                </span>
                <span className="shrink-0 tabular-nums opacity-70">{took(job)}</span>
              </Button>
            </li>
          ))}
        </ul>
      </ResizablePanel>
      <ResizableHandle withHandle={false} aria-label="Resize the list of actions" onDoubleClick={side.reset} />
      <ResizablePanel id="log" minSize="30%" className="min-w-0">
        <TerminalSurface key={id} label={`Output of ${shown.title}`} readOnly attach={attach} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
})
