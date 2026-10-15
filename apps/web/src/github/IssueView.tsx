import type { IssueDetails } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { ArrowLeft, CircleCheck, CircleDot, SquareArrowOutUpRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { Comment, Composer } from './Conversation'
import { ItemSidebar } from './ItemSidebar'
import { StatePill } from './StatePill'
import { ThreadView } from './Timeline'
import { ago } from './time'
import { usePoll } from './usePoll'
import { EditableTitle, useThread } from './useThread'

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

  usePoll(() => Promise.all([api.github.issue(number).then(setIssue, () => {}), reloadThread(true)]), 20_000)

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
  const toggle = async () => {
    setBusy(true)
    try {
      await api.github.setIssueState(number, open ? 'closed' : 'open')
      toast(open ? `Closed #${number}` : `Reopened #${number}`)
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
    <article aria-label={`Issue ${number}`} className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6">
        {back}
        <div className="flex items-start gap-3">
          <EditableTitle
            number={issue.number}
            title={issue.title}
            canEdit={thread?.viewer.canEdit ?? false}
            onChanged={() => void refresh()}
          />
          <Button size="sm" variant="outline" asChild>
            <a href={issue.url} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRight />
              Open on GitHub
            </a>
          </Button>
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
              {() => (
                <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => void toggle()}>
                  {open ? <CircleCheck /> : <CircleDot />}
                  {open ? 'Close issue' : 'Reopen issue'}
                </Button>
              )}
            </Composer>
          </div>
          <ItemSidebar assignees={issue.assignees} labels={issue.labels} milestone={issue.milestone} />
        </div>
      </div>
    </article>
  )
}
