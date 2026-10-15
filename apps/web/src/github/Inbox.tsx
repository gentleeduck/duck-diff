import type { Notification } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, CircleDot, GitPullRequest, MailCheck, RefreshCw, Rocket, Workflow } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { ListRowsSkeleton } from '../app/skeletons'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useView } from '../hooks/useView'
import { useGitHub } from './SignIn'
import { isReady } from './store'
import { ago } from './time'

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
  const { queries } = useApp()
  const ready = isReady(useGitHub())
  const { data } = useQuery({ ...queries.gh.notifications(false), enabled: ready })
  return ready ? (data?.filter((entry) => entry.unread).length ?? 0) : 0
}

export function Inbox() {
  const { api, pullSelection, issueSelection, queries } = useApp()
  const { show } = useView()
  const ready = isReady(useGitHub())
  const page = useRef<HTMLDivElement>(null)
  useScrollMemory(page, ready ? 'inbox' : null)
  const [all, setAll] = useState(false)
  const client = useQueryClient()
  const { data: items = null, error, refetch } = useQuery({ ...queries.gh.notifications(all), enabled: ready })
  const failed = error ? error.message : null

  const markRead = async (id: string | null) => {
    try {
      await api.github.markRead(id)
      // Both lists (unread and all) show the change at once; the next event reads them again.
      client.setQueriesData<Notification[]>({ queryKey: ['github', 'notifications'] }, (prev) =>
        prev?.map((entry) => (id === null || entry.id === id ? { ...entry, unread: false } : entry)),
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
      <div className="flex w-full flex-col gap-4 p-6">
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
          <IconTool label="Reload notifications" onClick={() => void refetch()}>
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
            {!items && !failed ? <ListRowsSkeleton twoLines /> : null}
            {items?.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                {all ? 'No notifications for this repository.' : 'All caught up. Inbox zero, duck hero.'}
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
