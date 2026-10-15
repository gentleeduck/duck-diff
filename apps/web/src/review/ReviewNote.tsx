import { Badge, Button, Textarea } from '@duck-diff/ui'
import { CircleCheck, FilePen, GitCommitHorizontal, ListPlus, ListX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { Body as GitHubBody, Comment as GitHubComment } from '../github/Conversation'
import type { PullReviewState } from '../github/pull-review'
import { useStore } from '../lib/store'
import { relativeTime } from '../sidebar/relative-time'
import type { Draft, Note } from './annotations'
import { ImagePreview } from './ImagePreview'

const selectPull = (state: PullReviewState) => state.number
const selectBatch = (state: PullReviewState) => state.batch
const HAS_SUGGESTION = /```suggestion/

// Commit one suggestion, or the batch it belongs to, with a message the user can change.
function SuggestionActions({ id, outdated }: { id: number; outdated: boolean }) {
  const { pullReview } = useApp()
  const batch = useStore(pullReview, selectBatch)
  const [busy, setBusy] = useState(false)
  const inBatch = batch.includes(id)
  if (outdated) return <span className="text-muted-foreground">Outdated suggestions cannot be applied.</span>
  const commit = async (ids: number[]) => {
    const answer = await ask.prompt({
      title: ids.length === 1 ? 'Commit suggestion' : `Commit ${ids.length} suggestions`,
      body: 'Commits to the pull request branch on GitHub.',
      fields: [
        {
          name: 'message',
          label: 'Commit message',
          initial: ids.length === 1 ? 'Apply suggestion from code review' : 'Apply suggestions from code review',
        },
      ],
      action: 'Commit changes',
    })
    if (!answer) return
    setBusy(true)
    try {
      await pullReview.commitSuggestions(ids, answer.message ?? '')
      toast(ids.length === 1 ? 'Committed the suggestion' : `Committed ${ids.length} suggestions`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {inBatch && batch.length > 1 ? (
        <Button size="sm" loading={busy} onClick={() => void commit(batch)}>
          <GitCommitHorizontal />
          Commit {batch.length} suggestions
        </Button>
      ) : (
        <Button size="sm" variant="outline" loading={busy} onClick={() => void commit([id])}>
          <GitCommitHorizontal />
          Commit suggestion
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => pullReview.toggleBatch(id)}>
        {inBatch ? <ListX /> : <ListPlus />}
        {inBatch ? 'Remove from batch' : 'Add suggestion to batch'}
      </Button>
    </>
  )
}

const toComment = (draft: Draft, body: string) => ({
  body: body.trim(),
  path: draft.path,
  line: draft.line,
  ...(draft.startLine ? { startLine: draft.startLine } : {}),
  side: draft.side === 'deletions' ? ('LEFT' as const) : ('RIGHT' as const),
})

const lines = (start: number | null | undefined, end: number | null) =>
  start && end && start < end ? `Lines ${start} to ${end}` : null

function Editor({
  initial,
  label,
  onSave,
  onCancel,
  onPublish,
  onPending,
  suggestFrom,
  saveLabel = 'Save comment',
}: {
  initial: string
  label: string
  saveLabel?: string
  onSave(body: string): Promise<void>
  onCancel(): void
  // Set while the diff shows a pull request: posts the comment on GitHub right away...
  onPublish?: (body: string) => Promise<void>
  // ...or adds it to the review being gathered, as GitHub's "Start a review" does.
  onPending?: (body: string) => Promise<void>
  // The line's text, for GitHub's "Suggest change".
  suggestFrom?: string
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
      <div className="flex flex-wrap gap-2">
        {suggestFrom !== undefined ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Propose a replacement the author can apply"
            onClick={() =>
              setBody(`${body}${body && !body.endsWith('\n') ? '\n' : ''}\`\`\`suggestion\n${suggestFrom}\n\`\`\`\n`)
            }>
            <FilePen />
            Suggest change
          </Button>
        ) : null}
        {onPending ? (
          <Button type="button" size="sm" disabled={!body.trim() || busy} onClick={() => void submit(onPending)}>
            Add to review
          </Button>
        ) : null}
        {onPublish ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!body.trim() || busy}
            onClick={() => void submit(onPublish)}>
            Add single comment
          </Button>
        ) : null}
        <Button type="submit" size="sm" variant={onPublish ? 'ghost' : 'default'} disabled={!body.trim() || busy}>
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
        {lines(comment.startLine, comment.line) ? <span>{lines(comment.startLine, comment.line)}</span> : null}
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
  const state = useStore(pullReview, (value: PullReviewState) => (root ? value.threads.get(root.id) : undefined))
  // Resolved threads fold to one line, as GitHub shows them.
  const [open, setOpen] = useState(!state?.resolved)
  const resolve = (resolved: boolean) =>
    root &&
    pullReview.resolve(root.id, resolved).then(
      () => setOpen(!resolved),
      (error: Error) => toast.error(error.message),
    )
  if (state?.resolved && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-3 my-2 flex max-w-3xl cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-muted-foreground font-normal font-sans">
        <CircleCheck className="size-4 text-added" />
        Resolved conversation by {root?.author.login} · {thread.length} {thread.length === 1 ? 'comment' : 'comments'}
      </button>
    )
  }
  return (
    <div className="mx-3 my-2 max-w-3xl divide-y divide-border rounded-md border border-border bg-card font-normal font-sans">
      {root && lines(root.startLine, root.line) ? (
        <p className="px-3 py-1.5 text-muted-foreground">{lines(root.startLine, root.line)}</p>
      ) : null}
      {thread.map((comment) => (
        <div key={comment.id}>
          <GitHubComment {...comment} bare />
          {HAS_SUGGESTION.test(comment.body) ? (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
              <SuggestionActions id={comment.id} outdated={comment.line === null || Boolean(state?.outdated)} />
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex items-center gap-2 p-2">
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
          <>
            <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
              Reply
            </Button>
            {state ? (
              <Button size="sm" variant="outline" className="ms-auto" onClick={() => void resolve(!state.resolved)}>
                {state.resolved ? 'Unresolve conversation' : 'Resolve conversation'}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function Pending({ note }: { note: Extract<Note, { kind: 'pending' }> }) {
  const { pullReview } = useApp()
  return (
    <div className="mx-3 my-2 flex max-w-3xl flex-col gap-2 rounded-md border border-tn-yellow/40 bg-card p-3 font-normal font-sans">
      <header className="flex items-center gap-2">
        <Badge variant="outline" size="sm" className="border-tn-yellow/40 text-tn-yellow">
          Pending
        </Badge>
        <span className="text-muted-foreground">Sent with your review</span>
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => pullReview.removePending(note.index)}>
          Remove
        </Button>
      </header>
      <GitHubBody text={note.comment.body} />
    </div>
  )
}

export function ReviewNote({ note }: { note: Note }) {
  const { reviews, pullReview } = useApp()
  const pull = useStore(pullReview, selectPull)
  if (note.kind === 'image') return <ImagePreview file={note.file} />
  if (note.kind === 'github') return <GitHubThread thread={note.thread} />
  if (note.kind === 'pending') return <Pending note={note} />
  return (
    <div className="mx-3 my-2 max-w-3xl rounded-md border border-border bg-card p-3 font-normal font-sans shadow-xs">
      {note.kind === 'draft' && note.draft.startLine ? (
        <p className="mb-2 text-muted-foreground">
          Commenting on {lines(note.draft.startLine, note.draft.line)?.toLowerCase()}
        </p>
      ) : null}
      {note.kind === 'draft' ? (
        <Editor
          initial=""
          label="New comment"
          onSave={(body) => reviews.save(body)}
          onCancel={() => reviews.cancelDraft()}
          suggestFrom={pull === null ? undefined : note.draft.text}
          onPending={
            pull === null
              ? undefined
              : async (body) => {
                  pullReview.addPending(toComment(note.draft, body))
                  reviews.cancelDraft()
                }
          }
          onPublish={
            pull === null
              ? undefined
              : async (body) => {
                  await pullReview.post(toComment(note.draft, body))
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
