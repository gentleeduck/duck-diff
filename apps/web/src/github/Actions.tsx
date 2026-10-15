import type { WorkflowRun } from '@duck-diff/protocol'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  CircleX,
  Loader,
  RefreshCw,
  RotateCcw,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { ListRowsSkeleton } from '../app/skeletons'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { Avatar } from './Conversation'
import { useGitHub } from './SignIn'
import { isReady } from './store'
import { ago } from './time'

export function runState(run: Pick<WorkflowRun, 'status' | 'conclusion'>): { icon: ReactNode; text: string } {
  if (run.status !== 'completed') {
    return run.status === 'in_progress'
      ? { icon: <Loader className="size-4 animate-spin text-tn-yellow" />, text: 'In progress' }
      : { icon: <CircleDashed className="size-4 text-tn-yellow" />, text: 'Queued' }
  }
  if (run.conclusion === 'success') return { icon: <CircleCheck className="size-4 text-added" />, text: 'Succeeded' }
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped')
    return { icon: <CircleSlash className="size-4 text-muted-foreground" />, text: 'Cancelled' }
  return { icon: <CircleX className="size-4 text-removed" />, text: 'Failed' }
}

export function Actions() {
  const { api, queries } = useApp()
  const ready = isReady(useGitHub())
  const page = useRef<HTMLDivElement>(null)
  useScrollMemory(page, ready ? 'actions' : null)
  const { data: items = null, error, refetch } = useQuery({ ...queries.gh.runs(), enabled: ready })
  const failed = error ? error.message : null

  const act = async (run: WorkflowRun, action: 'rerun' | 'rerun-failed' | 'cancel') => {
    try {
      await api.github.runAction(run.id, action)
      toast(action === 'cancel' ? `Cancelling ${run.name}` : `Re-running ${run.name}`)
      await refetch()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see workflow runs.</p>
  return (
    <div ref={page} className="h-full overflow-y-auto">
      <div className="flex w-full flex-col gap-4 p-6">
        <div className="rounded-md border border-border">
          <div className="flex items-center gap-2 border-border border-b bg-card px-4 py-1">
            <span className="flex-1">{items ? `${items.length} workflow runs` : 'Workflow runs'}</span>
            <IconTool label="Reload workflow runs" onClick={() => void refetch()}>
              <RefreshCw />
            </IconTool>
          </div>
          <ul aria-label="Workflow runs">
            {failed ? <p className="p-4 text-removed">{failed}</p> : null}
            {!items && !failed ? <ListRowsSkeleton twoLines /> : null}
            {items?.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                No workflow runs here. CI has never yelled at you; cherish it.
              </p>
            ) : null}
            {items?.map((run) => {
              const state = runState(run)
              const done = run.status === 'completed'
              return (
                <ContextMenu key={run.id}>
                  <ContextMenuTrigger asChild>
                    <li className="flex items-center gap-3 border-border border-b px-4 py-2 last:border-b-0 hover:bg-accent/40">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span role="img" aria-label={state.text} className="shrink-0">
                            {state.icon}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{state.text}</TooltipContent>
                      </Tooltip>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-foreground">{run.title}</span>
                        <span className="truncate text-muted-foreground">
                          {run.name} on <span className="text-tn-blue">{run.branch}</span> from a{' '}
                          {run.event.replaceAll('_', ' ')} {ago(run.createdAt)}
                        </span>
                      </span>
                      <Avatar user={run.actor} />
                      {done ? (
                        <IconTool
                          label={`Re-run ${run.name}`}
                          tip="Re-run all jobs"
                          onClick={() => void act(run, 'rerun')}>
                          <RotateCcw />
                        </IconTool>
                      ) : (
                        <IconTool label={`Cancel ${run.name}`} tip="Cancel run" onClick={() => void act(run, 'cancel')}>
                          <CircleSlash />
                        </IconTool>
                      )}
                      <IconTool
                        label={`Open ${run.name} on GitHub`}
                        tip="Open on GitHub"
                        onClick={() => window.open(run.url, '_blank', 'noreferrer')}>
                        <SquareArrowOutUpRight />
                      </IconTool>
                    </li>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    {done ? (
                      <>
                        <ContextMenuItem onSelect={() => void act(run, 'rerun')}>
                          <RotateCcw />
                          Re-run all jobs
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={run.conclusion === 'success'}
                          onSelect={() => void act(run, 'rerun-failed')}>
                          <RotateCcw />
                          Re-run failed jobs
                        </ContextMenuItem>
                      </>
                    ) : (
                      <ContextMenuItem onSelect={() => void act(run, 'cancel')}>
                        <CircleSlash />
                        Cancel run
                      </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => window.open(run.url, '_blank', 'noreferrer')}>
                      <SquareArrowOutUpRight />
                      Open on GitHub
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
