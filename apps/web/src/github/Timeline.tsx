import type { Thread, TimelineEvent } from '@duck-diff/protocol'
import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import {
  Check,
  CircleCheck,
  CircleDot,
  Copy,
  Ellipsis,
  Eye,
  GitCommitHorizontal,
  GitMerge,
  MessageSquareQuote,
  Pencil,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import type { Store } from '../lib/store'
import { Avatar, Body } from './Conversation'
import { MarkdownEditor } from './MarkdownEditor'
import { Reactions } from './Reactions'
import { ago } from './time'

function MenuItem({
  onSelect,
  children,
  destructive,
}: {
  onSelect(): void
  children: ReactNode
  destructive?: boolean
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={`w-full justify-start ${destructive ? 'text-destructive' : ''}`}
      onClick={onSelect}>
      {children}
    </Button>
  )
}

// A quote reply prefixes every line, as GitHub's does.
const quote = (text: string) => `${text.trim().replace(/^/gm, '> ')}\n\n`

function CommentCard({
  author,
  createdAt,
  body,
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
  const [menu, setMenu] = useState(false)
  const pick = (action: () => void) => {
    setMenu(false)
    action()
  }
  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <article className="rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-border border-b px-3 py-1 text-muted-foreground">
        <Avatar user={author} />
        <span className="text-foreground">{author.login}</span>
        <span>{ago(createdAt)}</span>
        {edited ? <span className="text-tn-comment">edited</span> : null}
        {label ? (
          <Badge variant="outline" size="sm">
            {label}
          </Badge>
        ) : null}
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="ms-auto"
              aria-label={`Actions for ${author.login}'s comment`}>
              <Ellipsis />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-52 flex-col p-1">
            <MenuItem onSelect={() => pick(onQuote)}>
              <MessageSquareQuote />
              Quote reply
            </MenuItem>
            {link ? (
              <MenuItem
                onSelect={() =>
                  pick(() => void navigator.clipboard.writeText(link).then(() => toast('Copied the link')))
                }>
                <Copy />
                Copy link
              </MenuItem>
            ) : null}
            {canEdit ? (
              <MenuItem
                onSelect={() =>
                  pick(() => {
                    setDraft(body)
                    setEditing(true)
                  })
                }>
                <Pencil />
                Edit
              </MenuItem>
            ) : null}
            {canDelete && onDelete ? (
              <MenuItem destructive onSelect={() => pick(onDelete)}>
                <Trash2 />
                Delete
              </MenuItem>
            ) : null}
          </PopoverContent>
        </Popover>
      </header>
      <div className="flex flex-col gap-2 px-3 py-2">
        {editing ? (
          <>
            <MarkdownEditor
              label="Edit comment"
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
          <Body text={body} />
        )}
        {reactions}
      </div>
    </article>
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

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 ps-4 text-muted-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

// The description, then everything that happened, in GitHub's order.
export function ThreadView({
  thread,
  draft,
  onChanged,
}: {
  thread: Thread
  // The page's comment box, so a quote reply lands where the reader will type.
  draft: Store<string>
  onChanged(): void
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
      toast('Deleted the comment')
      onChanged()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <CommentCard
        author={thread.author}
        createdAt={thread.createdAt}
        body={thread.body}
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
                <div className="ms-12 rounded-md border border-border bg-card px-3 py-2">
                  <Body text={event.body} />
                </div>
              ) : null}
            </div>
          )
        }
        if (event.kind === 'commit') {
          return (
            <Line key={`m${event.sha}`} icon={<GitCommitHorizontal className="size-4" />}>
              <span className="text-foreground">{event.message.split('\n')[0]}</span>{' '}
              <span className="text-tn-comment">{event.sha.slice(0, 7)}</span>
            </Line>
          )
        }
        return (
          <Line key={event.id} icon={EVENT_ICON[event.event] ?? <CircleDot className="size-4 text-muted-foreground" />}>
            <span className="text-foreground">{event.actor.login}</span> {event.text} {ago(event.createdAt)}
          </Line>
        )
      })}
    </div>
  )
}
