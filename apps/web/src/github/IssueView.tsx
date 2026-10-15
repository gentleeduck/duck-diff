import type { IssueDetails } from '@duck-diff/protocol'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDot,
  CircleSlash,
  Lock,
  LockOpen,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { Comment, Composer } from './Conversation'
import { ItemSidebar } from './ItemSidebar'
import { NewIssue } from './NewIssue'
import { sidebarActions } from './SidebarEditors'
import { StatePill } from './StatePill'
import { ThreadMenu } from './ThreadMenu'
import { ThreadView } from './Timeline'
import { ago } from './time'
import { useLive } from './useLive'
import { EditableTitle, useThread } from './useThread'

const CLOSE_REASONS = [
  {
    reason: 'completed' as const,
    label: 'Close as completed',
    detail: 'Done, closed, fixed, resolved',
    icon: CircleCheck,
  },
  {
    reason: 'not_planned' as const,
    label: 'Close as not planned',
    detail: "Won't fix, can't repro, duplicate, stale",
    icon: CircleSlash,
  },
]

// GitHub's close button: one press closes as completed, the arrow picks the reason.
function CloseIssue({ busy, onClose }: { busy: boolean; onClose(reason: 'completed' | 'not_planned'): void }) {
  const [reason, setReason] = useState<'completed' | 'not_planned'>('completed')
  const chosen = CLOSE_REASONS.find((entry) => entry.reason === reason) ?? CLOSE_REASONS[0]
  return (
    <div className="flex">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="rounded-e-none"
        loading={busy}
        onClick={() => onClose(reason)}>
        {chosen ? (
          <chosen.icon className={reason === 'completed' ? 'text-tn-magenta' : 'text-muted-foreground'} />
        ) : null}
        {reason === 'completed' ? 'Close issue' : 'Close as not planned'}
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Choose how to close"
            className="rounded-s-none border-s-0 px-2">
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-72 flex-col p-1">
          {CLOSE_REASONS.map((entry) => (
            <button
              key={entry.reason}
              type="button"
              onClick={() => setReason(entry.reason)}
              className="flex cursor-pointer gap-2 rounded-sm p-2 text-start hover:bg-accent">
              <span className="w-4 pt-0.5">{entry.reason === reason ? <Check className="size-4" /> : null}</span>
              <entry.icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground">{entry.label}</span>
                <span className="text-muted-foreground">{entry.detail}</span>
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default function IssueView({ number, onChanged }: { number: number; onChanged(): void }) {
  const { api, issueSelection } = useApp()
  const [issue, setIssue] = useState<IssueDetails | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { thread, draft, reload: reloadThread } = useThread(number)

  const load = useCallback(
    (alive: () => boolean = () => true) =>
      api.github.issue(number).then(
        (next) => alive() && setIssue(next),
        (error: Error) => alive() && setFailed(error.message),
      ),
    [api, number],
  )

  useEffect(() => {
    let alive = true
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  useLive(`item:${number}`, () => Promise.all([api.github.issue(number).then(setIssue, () => {}), reloadThread(true)]))
  const page = useRef<HTMLElement>(null)
  useScrollMemory(page, issue && thread ? `issue:${number}` : null)

  const back = (
    <button
      type="button"
      onClick={() => issueSelection.set(null)}
      className="flex w-fit cursor-pointer items-center gap-1 text-tn-blue hover:underline">
      <ArrowLeft className="size-4" />
      Issues
    </button>
  )

  if (failed || !issue) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6">
        {back}
        {failed ? (
          <p className="text-removed">
            Could not read #{number}: {failed}
          </p>
        ) : (
          <p className="text-muted-foreground">Loading #{number}...</p>
        )}
      </div>
    )
  }

  const open = issue.state === 'open'
  const refresh = async () => {
    await Promise.all([load(), reloadThread()])
    onChanged()
  }
  const toggle = async (reason?: 'completed' | 'not_planned') => {
    setBusy(true)
    try {
      await api.github.setIssueState(number, open ? 'closed' : 'open', reason)
      toast(open ? `Closed #${number}${reason === 'not_planned' ? ' as not planned' : ''}` : `Reopened #${number}`)
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const comment = async (body: string) => {
    try {
      await api.github.comment(number, body)
      toast('Commented')
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
      throw error
    }
  }
  const comments = thread?.timeline.filter((event) => event.kind === 'comment').length ?? issue.comments

  return (
    <article ref={page} aria-label={`Issue ${number}`} className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6">
        {back}
        <div className="flex items-start gap-3">
          <EditableTitle
            number={issue.number}
            title={issue.title}
            canEdit={thread?.viewer.canEdit ?? false}
            onChanged={() => void refresh()}
          />
          <NewIssue onCreated={onChanged} />
          <Button size="sm" variant="outline" asChild>
            <a href={issue.url} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRight />
              Open on GitHub
            </a>
          </Button>
          <ThreadMenu
            actions={[
              issue.locked
                ? {
                    label: 'Unlock conversation',
                    icon: <LockOpen />,
                    run: () =>
                      void api.github.setLocked(number, false).then(
                        () => refresh(),
                        (error: Error) => toast.error(error.message),
                      ),
                  }
                : {
                    label: 'Lock conversation',
                    icon: <Lock />,
                    run: () =>
                      void api.github.setLocked(number, true).then(
                        () => refresh(),
                        (error: Error) => toast.error(error.message),
                      ),
                  },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-border border-b pb-3 text-muted-foreground">
          <StatePill kind="issue" state={issue.state} />
          <span className="text-foreground">{issue.author.login}</span>
          <span>
            opened this issue {ago(issue.createdAt)} · {comments} {comments === 1 ? 'comment' : 'comments'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {thread ? (
              <ThreadView thread={thread} draft={draft} onChanged={() => void reloadThread()} />
            ) : (
              <Comment author={issue.author} createdAt={issue.createdAt} body={issue.body} />
            )}
            <Composer draft={draft} label="Comment on this issue" onSend={comment}>
              {() =>
                open ? (
                  <CloseIssue busy={busy} onClose={(reason) => void toggle(reason)} />
                ) : (
                  <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => void toggle()}>
                    <CircleDot />
                    Reopen issue
                  </Button>
                )
              }
            </Composer>
          </div>
          <ItemSidebar
            assignees={issue.assignees}
            labels={issue.labels}
            milestone={issue.milestone}
            number={number}
            actions={sidebarActions({
              api,
              number,
              assignees: issue.assignees,
              labels: issue.labels,
              milestone: issue.milestone,

              reload: () => void load(),
            })}
          />
        </div>
      </div>
    </article>
  )
}
