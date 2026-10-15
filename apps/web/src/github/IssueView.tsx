import type { IssueDetails } from '@duck-diff/protocol'
import { Badge, Button, Separator } from '@duck-diff/ui'
import { CircleCheck, CircleDot, SquareArrowOutUpRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { Avatar, Comment, Composer } from './Conversation'
import { IssueIcon } from './IssuesSidebar'
import { Labels } from './Labels'
import { GitHubGate } from './SignIn'
import { ThreadView } from './Timeline'
import { ago } from './time'
import { EditableTitle, useThread } from './useThread'

const selectNumber = (value: number | null) => value

function Issue({ number, onChanged }: { number: number; onChanged(): void }) {
  const { api } = useApp()
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
    setIssue(null)
    setFailed(null)
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  if (failed)
    return (
      <p className="p-4 text-removed">
        Could not read #{number}: {failed}
      </p>
    )
  if (!issue) return <p className="p-4 text-muted-foreground">Loading #{number}...</p>

  const open = issue.state === 'open'
  const toggle = async () => {
    setBusy(true)
    try {
      await api.github.setIssueState(number, open ? 'closed' : 'open')
      toast(open ? `Closed #${number}` : `Reopened #${number}`)
      await Promise.all([load(), reloadThread()])
      onChanged()
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
      await Promise.all([load(), reloadThread()])
      onChanged()
    } catch (error) {
      toast.error((error as Error).message)
      throw error
    }
  }

  return (
    <article aria-label={`Issue ${number}`} className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-border border-b bg-card px-4 py-3">
        <div className="flex items-start gap-3">
          <EditableTitle
            number={issue.number}
            title={issue.title}
            canEdit={thread?.viewer.canEdit ?? false}
            onChanged={() => {
              void load()
              void reloadThread()
              onChanged()
            }}
          />
          <Button size="sm" variant="outline" loading={busy} onClick={toggle}>
            {open ? <CircleCheck /> : <CircleDot />}
            {open ? 'Close issue' : 'Reopen'}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={issue.url} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRight />
              GitHub
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Badge
            variant="outline"
            size="sm"
            className={
              open ? 'border-added/40 bg-added/15 text-added' : 'border-tn-magenta/40 bg-tn-magenta/15 text-tn-magenta'
            }>
            <IssueIcon state={issue.state} />
            {open ? 'Open' : 'Closed'}
          </Badge>
          <Avatar user={issue.author} />
          <span className="text-foreground">{issue.author.login}</span>
          <span>opened {ago(issue.createdAt)}</span>
          <Labels labels={issue.labels} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
          {thread ? (
            <ThreadView thread={thread} draft={draft} onChanged={() => void reloadThread()} />
          ) : (
            <Comment author={issue.author} createdAt={issue.createdAt} body={issue.body} />
          )}
          <Separator />
          <Composer draft={draft} label="Comment on this issue" onSend={comment} />
        </div>
      </div>
    </article>
  )
}

export default function IssueView({ onChanged }: { onChanged(): void }) {
  const { issueSelection } = useApp()
  const number = useStore(issueSelection, selectNumber)
  return (
    <GitHubGate>
      {number === null ? (
        <p className="p-4 text-muted-foreground">Pick an issue on the left.</p>
      ) : (
        <Issue key={number} number={number} onChanged={onChanged} />
      )}
    </GitHubGate>
  )
}
