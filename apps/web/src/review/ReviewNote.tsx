import { Button, Textarea } from '@duck-diff/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { Comment as GitHubComment } from '../github/Conversation'
import type { PullReviewState } from '../github/pull-review'
import { useStore } from '../lib/store'
import { relativeTime } from '../sidebar/relative-time'
import type { Note } from './annotations'
import { ImagePreview } from './ImagePreview'

const selectPull = (state: PullReviewState) => state.number

function Editor({
  initial,
  label,
  onSave,
  onCancel,
  onPublish,
  saveLabel = 'Save comment',
}: {
  initial: string
  label: string
  saveLabel?: string
  onSave(body: string): Promise<void>
  onCancel(): void
  // Set while the diff shows a pull request: posts the comment on GitHub instead of keeping it local.
  onPublish?: (body: string) => Promise<void>
}) {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async (send = onSave) => {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      await send(body)
    } catch (error) {
      toast.error(`Could not save the comment: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}>
      <Textarea
        autoFocus
        aria-label={label}
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit()
        }}
      />
      <div className="flex gap-2">
        {onPublish ? (
          <Button type="button" size="sm" disabled={!body.trim() || busy} onClick={() => void submit(onPublish)}>
            Comment on GitHub
          </Button>
        ) : null}
        <Button type="submit" size="sm" variant={onPublish ? 'outline' : 'default'} disabled={!body.trim() || busy}>
          {onPublish ? 'Keep local' : saveLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Comment({ note }: { note: Extract<Note, { kind: 'comment' }> }) {
  const { reviews } = useApp()
  const [editing, setEditing] = useState(false)
  const { comment, outdated } = note
  if (editing) {
    return (
      <Editor
        initial={comment.body}
        label="Edit comment"
        onSave={async (body) => {
          await reviews.edit(comment.id, body)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  return (
    <article className="flex flex-col gap-1">
      <header className="flex items-center gap-2 text-muted-foreground">
        {outdated ? <span>Outdated: line {comment.line} has changed</span> : null}
        <span>{relativeTime(comment.updatedAt / 1000)}</span>
        <span className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              reviews.remove(comment.id).catch((error: Error) => toast.error(`Could not delete: ${error.message}`))
            }>
            Delete
          </Button>
        </span>
      </header>
      <p className="whitespace-pre-wrap text-foreground">{comment.body}</p>
    </article>
  )
}

function GitHubThread({ thread }: { thread: Extract<Note, { kind: 'github' }>['thread'] }) {
  const { pullReview } = useApp()
  const [replying, setReplying] = useState(false)
  const root = thread[0]
  return (
    <div className="mx-3 my-2 max-w-3xl divide-y divide-border rounded-md border border-border bg-card font-normal font-sans">
      {thread.map((comment) => (
        <GitHubComment key={comment.id} {...comment} bare />
      ))}
      <div className="p-2">
        {replying && root ? (
          <Editor
            initial=""
            label="Reply"
            saveLabel="Reply"
            onSave={async (body) => {
              await pullReview.reply(root.id, body.trim())
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
            Reply
          </Button>
        )}
      </div>
    </div>
  )
}

export function ReviewNote({ note }: { note: Note }) {
  const { reviews, pullReview } = useApp()
  const pull = useStore(pullReview, selectPull)
  if (note.kind === 'image') return <ImagePreview file={note.file} />
  if (note.kind === 'github') return <GitHubThread thread={note.thread} />
  return (
    <div className="mx-3 my-2 max-w-3xl rounded-md border border-border bg-card p-3 font-normal font-sans shadow-xs">
      {note.kind === 'draft' ? (
        <Editor
          initial=""
          label="New comment"
          onSave={(body) => reviews.save(body)}
          onCancel={() => reviews.cancelDraft()}
          onPublish={
            pull === null
              ? undefined
              : async (body) => {
                  const { draft } = note
                  await pullReview.post({
                    body: body.trim(),
                    path: draft.path,
                    line: draft.line,
                    side: draft.side === 'deletions' ? 'LEFT' : 'RIGHT',
                  })
                  reviews.cancelDraft()
                  toast(`Commented on #${pull}`)
                }
          }
        />
      ) : (
        <Comment note={note} />
      )}
    </div>
  )
}
