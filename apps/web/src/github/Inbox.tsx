import type { Notification } from '@duck-diff/protocol'
import { Badge, Button, Skeleton } from '@duck-diff/ui'
import { Bell, CheckCheck, CircleDot, GitPullRequest, MailCheck, RefreshCw, Rocket, Workflow } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useView } from '../hooks/useView'
import { useGitHub } from './SignIn'
import { isReady } from './store'
import { ago } from './time'
import { usePoll } from './usePoll'

const SKELETONS = ['a', 'b', 'c', 'd']

const ICONS: Record<string, ReactNode> = {
  PullRequest: <GitPullRequest className="size-4 text-added" />,
  Issue: <CircleDot className="size-4 text-added" />,
  Release: <Rocket className="size-4 text-tn-blue" />,
  CheckSuite: <Workflow className="size-4 text-tn-yellow" />,
}

// GitHub's reason codes, said the way its inbox says them.
const REASONS: Record<string, string> = {
  assign: 'Assigned',
  author: 'Author',
  comment: 'Commented',
  ci_activity: 'CI activity',
  mention: 'Mentioned',
  review_requested: 'Review requested',
  state_change: 'State changed',
  subscribed: 'Watching',
  team_mention: 'Team mentioned',
  manual: 'Subscribed',
}

// The unread count for the rail badge, asked for less often than the inbox page polls.
export function useUnread(): number {
  const { api } = useApp()
  const ready = isReady(useGitHub())
  const [count, setCount] = useState(0)
  const read = useCallback(
    () =>
      ready
        ? api.github.notifications(false).then(
            (found) => setCount(found.filter((entry) => entry.unread).length),
            () => {},
          )
        : setCount(0),
    [api, ready],
  )
  useEffect(() => void read(), [read])
  usePoll(read, 90_000)
  return count
}

export function Inbox() {
  const { api, pullSelection, issueSelection } = useApp()
  const { show } = useView()
  const ready = isReady(useGitHub())
  const page = useRef<HTMLDivElement>(null)
  useScrollMemory(page, ready ? 'inbox' : null)
  const [all, setAll] = useState(false)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(
    () =>
      api.github.notifications(all).then(
        (found) => {
          setItems(found)
          setFailed(null)
        },
        (error: Error) => setFailed(error.message),
      ),
    [api, all],
  )
  useEffect(() => {
    if (!ready) return
    setItems(null)
    void load()
  }, [ready, load])
  usePoll(load, 45_000)

  const markRead = async (id: string | null) => {
    try {
      await api.github.markRead(id)
      setItems(
        (prev) => prev?.map((entry) => (id === null || entry.id === id ? { ...entry, unread: false } : entry)) ?? null,
      )
      if (id === null) toast('Marked everything as read')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const jump = (entry: Notification) => {
    if (entry.number === null) return
    if (entry.unread) void markRead(entry.id)
    if (entry.type === 'PullRequest') {
      show('prs')
      pullSelection.set(entry.number)
    } else {
      show('issues')
      issueSelection.set(entry.number)
    }
  }

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see notifications.</p>

  const unread = items?.filter((entry) => entry.unread).length ?? 0
  return (
    <div ref={page} className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Show" className="flex items-center gap-1">
            {([false, true] as const).map((value) => (
              <Button
                key={String(value)}
                size="sm"
                variant={all === value ? 'secondary' : 'ghost'}
                role="tab"
                aria-selected={all === value}
                onClick={() => setAll(value)}>
                {value ? 'All' : 'Unread'}
              </Button>
            ))}
          </div>
          <span className="flex-1" />
          <Button size="sm" variant="outline" disabled={!unread} onClick={() => void markRead(null)}>
            <CheckCheck />
            Mark all as read
          </Button>
          <IconTool label="Reload notifications" onClick={() => void load()}>
            <RefreshCw />
          </IconTool>
        </div>
        <div className="rounded-md border border-border">
          <div className="flex items-center gap-2 border-border border-b bg-card px-4 py-2">
            <Bell className="size-4" />
            {unread} unread
          </div>
          <ul aria-label="Notifications">
            {failed ? <p className="p-4 text-removed">{failed}</p> : null}
            {!items && !failed ? SKELETONS.map((key) => <Skeleton key={key} className="m-3 h-10" />) : null}
            {items?.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                {all ? 'No notifications for this repository.' : 'All caught up.'}
              </p>
            ) : null}
            {items?.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-border border-b px-4 py-2 last:border-b-0 hover:bg-accent/40">
                <span className={`size-2 shrink-0 rounded-full ${entry.unread ? 'bg-tn-blue' : ''}`} />
                {ICONS[entry.type] ?? <Bell className="size-4 text-muted-foreground" />}
                <button
                  type="button"
                  disabled={entry.number === null}
                  onClick={() => jump(entry)}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-start disabled:cursor-default">
                  <span className={entry.unread ? 'text-foreground' : 'text-muted-foreground'}>
                    {entry.title}
                    {entry.number === null ? null : <span className="text-muted-foreground"> #{entry.number}</span>}
                  </span>
                  <span className="text-muted-foreground">updated {ago(entry.updatedAt)}</span>
                </button>
                <Badge variant="outline" size="sm">
                  {REASONS[entry.reason] ?? entry.reason}
                </Badge>
                {entry.unread ? (
                  <IconTool
                    label={`Mark "${entry.title}" as read`}
                    tip="Mark as read"
                    onClick={() => void markRead(entry.id)}>
                    <MailCheck />
                  </IconTool>
                ) : (
                  <span className="size-7 shrink-0" />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
