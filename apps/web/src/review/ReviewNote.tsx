import { Button } from '@duck-diff/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { relativeTime } from '../sidebar/relative-time'
import type { Note } from './annotations'
import { ImagePreview } from './ImagePreview'

function Editor({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string
  label: string
  onSave(body: string): Promise<void>
  onCancel(): void
}) {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      await onSave(body)
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
      <textarea
        // biome-ignore lint/a11y/noAutofocus: the editor opens because someone asked to write right here
        autoFocus
        aria-label={label}
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit()
        }}
        className="w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-hidden transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!body.trim() || busy}>
          Save comment
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
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
      <header className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {outdated ? <span>Outdated: line {comment.line} has changed</span> : null}
        <span>{relativeTime(comment.updatedAt / 1000)}</span>
        <span className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[12px] text-muted-foreground"
            onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[12px] text-muted-foreground"
            onClick={() =>
              reviews.remove(comment.id).catch((error: Error) => toast.error(`Could not delete: ${error.message}`))
            }>
            Delete
          </Button>
        </span>
      </header>
      <p className="whitespace-pre-wrap text-[13px] text-foreground">{comment.body}</p>
    </article>
  )
}

export function ReviewNote({ note }: { note: Note }) {
  const { reviews } = useApp()
  if (note.kind === 'image') return <ImagePreview file={note.file} />
  return (
    <div className="mx-3 my-2 max-w-3xl rounded-md border border-border bg-card p-3 font-normal font-sans shadow-xs">
      {note.kind === 'draft' ? (
        <Editor
          initial=""
          label="New comment"
          onSave={(body) => reviews.save(body)}
          onCancel={() => reviews.cancelDraft()}
        />
      ) : (
        <Comment note={note} />
      )}
    </div>
  )
}
