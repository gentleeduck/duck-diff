import { Badge, Button, Input } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, MessagesSquare, Reply, SquareArrowOutUpRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { pageColumn } from '../app/page-column'
import { ListRowsSkeleton, ThreadSkeleton } from '../app/skeletons'
import { useKept } from '../lib/kept'
import { Avatar, Body } from './Conversation'
import { MarkdownEditor } from './MarkdownEditor'
import { useGitHub } from './SignIn'
import { isReady } from './store'
import { ago } from './time'

function DiscussionView({ number, onBack }: { number: number; onBack(): void }) {
  const { api, queries } = useApp()
  const { data: discussion = null, error, refetch } = useQuery(queries.gh.discussion(number))
  const failed = error ? error.message : null
  const [draft, setDraft] = useKept(`discussion:${number}:draft`, '')
  const [replying, setReplying] = useKept<string | null>(`discussion:${number}:replying`, null)
  const [reply, setReply] = useKept(`discussion:${number}:reply`, '')
  const [busy, setBusy] = useState(false)

  const load = refetch

  const send = async (body: string, replyTo?: string) => {
    setBusy(true)
    try {
      await api.github.replyDiscussion(number, body, replyTo)
      await load()
      return true
    } catch (error) {
      toast.error('Could not post the reply', { description: (error as Error).message })
      return false
    } finally {
      setBusy(false)
    }
  }
  const answer = async (comment: string, next: boolean) => {
    try {
      await api.github.markAnswer(comment, next)
      await load()
    } catch (error) {
      toast.error('Could not change the answer', { description: (error as Error).message })
    }
  }

  if (failed) return <p className="p-6 text-removed">{failed}</p>
  if (!discussion) return <ThreadSkeleton />
  return (
    <div className="h-full overflow-y-auto">
      <article aria-label={discussion.title} {...pageColumn('gap-4')}>
        <header className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Discussions
          </Button>
          <h1 className="min-w-0 flex-1 text-foreground">
            {discussion.title} <span className="text-muted-foreground">#{discussion.number}</span>
          </h1>
          <Button size="sm" variant="ghost" asChild>
            <a href={discussion.url} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRight />
              Open on GitHub
            </a>
          </Button>
        </header>
        <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <Badge variant="soft-info" size="sm">
            {discussion.category}
          </Badge>
          {discussion.answered ? (
            <Badge variant="soft-success" size="sm">
              Answered
            </Badge>
          ) : null}
          <Avatar user={discussion.author} />
          {discussion.author.login} started this {ago(discussion.createdAt)}
        </p>
        <div className="rounded-md border border-border p-4">
          <Body text={discussion.body} />
        </div>
        <ol aria-label="Comments" className="flex flex-col gap-3">
          {discussion.thread.map((comment) => (
            <li
              key={comment.id}
              aria-label={`Comment by ${comment.author.login}`}
              className={`flex flex-col gap-2 rounded-md border p-4 ${comment.answer ? 'border-tn-green' : 'border-border'}`}>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Avatar user={comment.author} />
                <span className="text-foreground">{comment.author.login}</span> {ago(comment.createdAt)}
                {comment.answer ? (
                  <span className="ms-2 flex items-center gap-1 text-tn-green">
                    <CircleCheck className="size-4" />
                    Answer
                  </span>
                ) : null}
                <span className="flex-1" />
                {discussion.answerable ? (
                  <Button size="sm" variant="ghost" onClick={() => void answer(comment.id, !comment.answer)}>
                    <CircleCheck />
                    {comment.answer ? 'Unmark as answer' : 'Mark as answer'}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Reply to ${comment.author.login}`}
                  onClick={() => setReplying(replying === comment.id ? null : comment.id)}>
                  <Reply />
                </Button>
              </p>
              <Body text={comment.body} />
              {comment.replies.length ? (
                <ul className="flex flex-col gap-2 border-border border-s-2 ps-3">
                  {comment.replies.map((entry) => (
                    <li key={entry.id} className="flex flex-col gap-1">
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Avatar user={entry.author} />
                        <span className="text-foreground">{entry.author.login}</span> {ago(entry.createdAt)}
                      </p>
                      <Body text={entry.body} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {replying === comment.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void send(reply, comment.id).then((ok) => {
                      if (!ok) return
                      setReply('')
                      setReplying(null)
                    })
                  }}>
                  <Input
                    autoFocus
                    aria-label={`Reply to ${comment.author.login}`}
                    placeholder="Write a reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={!reply.trim()} loading={busy}>
                    Reply
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ol>
        <section aria-label="Add a comment" className="flex flex-col gap-2">
          <MarkdownEditor label="Comment" value={draft} onChange={setDraft} placeholder="Add to the discussion" />
          <Button
            size="sm"
            className="self-end"
            disabled={!draft.trim()}
            loading={busy}
            onClick={() => void send(draft).then((ok) => ok && setDraft(''))}>
            Comment
          </Button>
        </section>
      </article>
    </div>
  )
}

// GitHub Discussions: the list, newest activity first, and one discussion as its own page.
export function Discussions() {
  const { queries } = useApp()
  const ready = isReady(useGitHub())
  const { data: items = null, error } = useQuery({ ...queries.gh.discussions(), enabled: ready })
  const failed = error ? error.message : null
  const [open, setOpen] = useState<number | null>(null)

  if (!ready) return <p className="p-6 text-muted-foreground">Sign in to see discussions.</p>
  if (open !== null) return <DiscussionView number={open} onBack={() => setOpen(null)} />
  return (
    <div className="h-full overflow-y-auto">
      <div {...pageColumn('gap-2')}>
        {failed ? <p className="text-removed">{failed}</p> : null}
        {!items && !failed ? (
          <div className="rounded-md border border-border">
            <ListRowsSkeleton twoLines />
          </div>
        ) : null}
        {items?.length === 0 ? (
          <p className="rounded-md border border-border border-dashed p-8 text-center text-muted-foreground">
            No discussions yet, or Discussions is turned off for this repository.
          </p>
        ) : null}
        {items?.length ? (
          <ul aria-label="Discussions" className="divide-y divide-border rounded-md border border-border">
            {items.map((item) => (
              <li key={item.number}>
                <Button
                  variant="nothing"
                  size="none"
                  type="button"
                  onClick={() => setOpen(item.number)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-start hover:bg-accent/50 justify-start rounded-none">
                  <MessagesSquare
                    className={`size-4 shrink-0 ${item.answered ? 'text-tn-green' : 'text-muted-foreground'}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-foreground">{item.title}</span>
                    <span className="truncate text-muted-foreground">
                      #{item.number} in {item.category} by {item.author.login}, updated {ago(item.updatedAt)}
                    </span>
                  </span>
                  {item.answered ? (
                    <Badge variant="soft-success" size="sm">
                      Answered
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground tabular-nums">{item.comments}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
