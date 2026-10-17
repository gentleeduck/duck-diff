import type { GitHubReviewComment, Thread, TimelineEvent } from '@duck-diff/protocol'
import { Badge, Button } from '@duck-diff/ui'
import {
  ArrowDown,
  Check,
  CircleCheck,
  CircleDot,
  Copy,
  Eye,
  FileCode,
  GitCommitHorizontal,
  GitMerge,
  MessageSquareQuote,
  Pencil,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import type { Store } from '../lib/store'
import { Avatar, Body } from './Conversation'
import { CommitLink, EventParts, UserLink } from './EventParts'
import { MarkdownEditor } from './MarkdownEditor'
import { MoreMenu } from './MoreMenu'
import { Reactions } from './Reactions'
import { ago } from './time'

// A quote reply prefixes every line, as GitHub's does.
const quote = (text: string) => `${text.trim().replace(/^/gm, '> ')}\n\n`

function CommentCard({
  author,
  createdAt,
  body,
  html,
  edited,
  label,
  canEdit,
  canDelete,
  link,
  reactions,
  onSave,
  onDelete,
  onQuote,
}: {
  author: Thread['author']
  createdAt: string
  body: string
  html: string | null
  edited: boolean
  label?: string
  canEdit: boolean
  canDelete: boolean
  link?: string
  reactions: ReactNode
  onSave(body: string): Promise<void>
  onDelete?(): void
  onQuote(): void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(body)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (error) {
      toast.error('Could not save the comment', { description: (error as Error).message })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="relative flex gap-3">
      <span className="hidden sm:block">
        <Avatar user={author} large />
      </span>
      <article className="min-w-0 flex-1 rounded-md border border-border bg-card">
        <header className="flex min-h-10 items-center gap-1.5 rounded-t-md border-border border-b bg-muted/40 px-3 py-1 text-muted-foreground">
          <span className="sm:hidden">
            <Avatar user={author} />
          </span>
          <span className="font-bold text-foreground">{author.login}</span>
          <span>commented {ago(createdAt)}</span>
          {edited ? <span>· edited</span> : null}
          <span className="ms-auto" />
          {label ? (
            <Badge variant="soft-info" size="sm">
              {label}
            </Badge>
          ) : null}
          <MoreMenu
            label={`Actions for ${author.login}'s comment`}
            actions={[
              { label: 'Quote reply', icon: <MessageSquareQuote />, run: onQuote },
              link
                ? {
                    label: 'Copy link',
                    icon: <Copy />,
                    run: () =>
                      void navigator.clipboard.writeText(link).then(
                        () => toast.success('Copied the link', { description: link }),
                        (error: Error) => toast.error('Could not copy', { description: error.message }),
                      ),
                  }
                : null,
              canEdit && {
                label: 'Edit',
                icon: <Pencil />,
                run: () => {
                  setDraft(body)
                  setEditing(true)
                },
              },
              canDelete && onDelete ? { label: 'Delete', icon: <Trash2 />, run: onDelete, destructive: true } : null,
            ]}
          />
        </header>
        <div className="flex flex-col gap-2 px-3 py-2">
          {editing ? (
            <>
              <MarkdownEditor
                label="Edit comment"
                rows={12}
                value={draft}
                onChange={setDraft}
                onSubmit={() => void save()}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" loading={saving} onClick={() => void save()}>
                  Update comment
                </Button>
              </div>
            </>
          ) : (
            <Body text={body} html={html} />
          )}
          {reactions}
        </div>
      </article>
    </div>
  )
}

const REVIEW_LOOK: Record<string, { text: string; icon: ReactNode }> = {
  approved: { text: 'approved these changes', icon: <Check className="size-4 text-added" /> },
  changes_requested: { text: 'requested changes', icon: <X className="size-4 text-removed" /> },
  commented: { text: 'reviewed', icon: <Eye className="size-4 text-tn-blue" /> },
  dismissed: { text: 'had a review dismissed', icon: <Eye className="size-4 text-muted-foreground" /> },
}

const EVENT_ICON: Record<string, ReactNode> = {
  closed: <CircleCheck className="size-4 text-tn-magenta" />,
  reopened: <CircleDot className="size-4 text-added" />,
  merged: <GitMerge className="size-4 text-tn-magenta" />,
  labeled: <Tag className="size-4 text-muted-foreground" />,
  unlabeled: <Tag className="size-4 text-muted-foreground" />,
}

// An event on the thread's line: its mark sits on the line that runs down behind the comments.
function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex items-center gap-2 py-0.5 ps-3 text-muted-foreground sm:ps-[3.25rem]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

// The description, then everything that happened, in GitHub's order.
export function ThreadView({
  thread,
  draft,
  onChanged,
  reviewComments = [],
  onOpenFile,
}: {
  thread: Thread
  // The page's comment box, so a quote reply lands where the reader will type.
  draft: Store<string>
  onChanged(): void
  // A pull request's line comments, shown under the review that sent them.
  reviewComments?: GitHubReviewComment[]
  onOpenFile?(path: string): void
}) {
  const { api } = useApp()
  const me = thread.viewer.login
  const addQuote = (text: string) => draft.set(`${draft.get()}${quote(text)}`)
  const remove = async (event: Extract<TimelineEvent, { kind: 'comment' }>) => {
    const yes = await ask.confirm({
      title: 'Delete comment',
      body: 'It is gone for everyone.',
      action: 'Delete',
      destructive: true,
    })
    if (!yes) return
    try {
      await api.github.deleteComment(event.id)
      toast.success('Deleted the comment')
      onChanged()
    } catch (error) {
      toast.error('Could not delete the comment', { description: (error as Error).message })
    }
  }

  return (
    <div className="relative flex flex-col gap-3">
      {/* The thread's line, from the first comment down to the last event, as on GitHub. */}
      <span aria-hidden className="absolute inset-y-0 start-[4.1875rem] hidden w-0.5 bg-border sm:block" />
      <CommentCard
        author={thread.author}
        createdAt={thread.createdAt}
        body={thread.body}
        html={thread.html}
        edited={thread.edited}
        label="Author"
        canEdit={thread.viewer.canEdit}
        canDelete={false}
        reactions={<Reactions target={{ issue: thread.number }} counts={thread.reactions} onChanged={onChanged} />}
        onSave={async (body) => {
          await api.github.editThread(thread.number, { body })
          onChanged()
        }}
        onQuote={() => addQuote(thread.body)}
      />
      {thread.timeline.map((event) => {
        if (event.kind === 'comment') {
          const mine = event.author.login === me
          return (
            <CommentCard
              key={`c${event.id}`}
              author={event.author}
              createdAt={event.createdAt}
              body={event.body}
              html={event.html}
              edited={event.edited}
              label={event.author.login === thread.author.login ? 'Author' : undefined}
              canEdit={mine || thread.viewer.canEdit}
              canDelete={mine || thread.viewer.canEdit}
              link={event.url}
              reactions={<Reactions target={{ comment: event.id }} counts={event.reactions} onChanged={onChanged} />}
              onSave={async (body) => {
                await api.github.editComment(event.id, body)
                onChanged()
              }}
              onDelete={() => void remove(event)}
              onQuote={() => addQuote(event.body)}
            />
          )
        }
        if (event.kind === 'review') {
          const look = REVIEW_LOOK[event.state] ?? REVIEW_LOOK.commented
          return (
            <div key={`r${event.id}`} className="flex flex-col gap-2">
              <Line icon={look?.icon}>
                <span className="text-foreground">{event.author.login}</span> {look?.text} {ago(event.createdAt)}
              </Line>
              {event.body.trim() ? (
                <div className="relative rounded-md border border-border bg-card px-3 py-2 sm:ms-[3.25rem]">
                  <Body text={event.body} html={event.html} />
                </div>
              ) : null}
              {reviewComments
                .filter((comment) => comment.reviewId === event.id && comment.inReplyTo === null)
                .map((comment) => (
                  <div key={comment.id} className="relative rounded-md border border-border bg-card sm:ms-[3.25rem]">
                    <header className="flex items-center gap-2 border-border border-b px-3 py-1.5">
                      <FileCode className="size-4 shrink-0 text-muted-foreground" />
                      <Button
                        variant="nothing"
                        size="none"
                        type="button"
                        disabled={!onOpenFile}
                        title={`Open ${comment.path} in Files changed`}
                        onClick={() => onOpenFile?.(comment.path)}
                        className="min-w-0 cursor-pointer truncate text-tn-blue hover:underline disabled:cursor-default disabled:text-foreground disabled:no-underline justify-start shrink rounded-none">
                        {comment.path}
                      </Button>
                      <span className="shrink-0 text-muted-foreground">
                        {comment.line === null
                          ? 'outdated'
                          : comment.startLine && comment.startLine < comment.line
                            ? `lines ${comment.startLine} to ${comment.line}`
                            : `line ${comment.line}`}
                      </span>
                    </header>
                    <div className="px-3 py-2">
                      <Body text={comment.body} />
                    </div>
                  </div>
                ))}
            </div>
          )
        }
        if (event.kind === 'commit') {
          return (
            <Line key={`m${event.sha}`} icon={<GitCommitHorizontal className="size-4" />}>
              <CommitLink sha={event.sha}>{event.message.split('\n')[0]}</CommitLink>{' '}
              <CommitLink sha={event.sha} className="cursor-pointer text-tn-comment hover:text-tn-blue hover:underline">
                {event.sha.slice(0, 7)}
              </CommitLink>
            </Line>
          )
        }
        return (
          <Line key={event.id} icon={EVENT_ICON[event.event] ?? <CircleDot className="size-4 text-muted-foreground" />}>
            <UserLink login={event.actor.login} /> {event.parts ? <EventParts parts={event.parts} /> : event.text}{' '}
            {ago(event.createdAt)}
          </Line>
        )
      })}
      <NewActivity thread={thread} />
    </div>
  )
}

const who = (event: TimelineEvent) =>
  event.kind === 'event' ? event.actor.login : event.kind === 'commit' ? null : event.author.login

// Polls bring in what others wrote while the page was open; a pill says so and jumps to it.
function NewActivity({ thread }: { thread: Thread }) {
  const [seen, setSeen] = useState(() => new Set(thread.timeline.map(key)))
  const end = useRef<HTMLDivElement>(null)
  const fresh = thread.timeline.filter((event) => !seen.has(key(event)) && who(event) !== thread.viewer.login)
  const catchUp = () => {
    setSeen(new Set(thread.timeline.map(key)))
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }
  return (
    <div ref={end}>
      {fresh.length ? (
        <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
          <Button size="sm" className="pointer-events-auto shadow-md" onClick={catchUp}>
            <ArrowDown />
            {fresh.length} new {fresh.length === 1 ? 'update' : 'updates'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

const key = (event: TimelineEvent) => `${event.kind}:${event.kind === 'commit' ? event.sha : event.id}`
