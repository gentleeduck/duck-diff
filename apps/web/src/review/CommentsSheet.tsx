import type { OrphanedComment } from '@duck-diff/protocol'
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Check, Copy, MessageSquare, Trash2 } from 'lucide-react'
import { useId, useMemo } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { COPIED, useCopy } from '../app/CopyTool'
import { COUNT, ICON_ONLY, LABEL } from '../app/fit'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'
import { useSession } from '../hooks/useSession'
import { itemId } from '../lib/items'
import { useKept } from '../lib/kept'
import { useStore } from '../lib/store'
import type { SessionState } from '../state/session'
import { type Anchored, anchorComments } from './anchor'
import type { ReviewsState } from './reviews'

const selectItems = (state: SessionState) => state.items
const selectComments = (state: ReviewsState) => state.comments
const selectTarget = (state: ReviewsState) => state.target

const fromDeleted = (count: number) => `${count} from ${count === 1 ? 'a deleted branch' : 'deleted branches'}`

export function CommentsSheet() {
  const { api, reviews, viewer, queries } = useApp()
  const orphaned = useQuery(queries.git.reviewOverview()).data?.orphaned ?? []
  const branch = useGit().status?.branch ?? null
  const items = useSession(selectItems)
  const comments = useStore(reviews, selectComments)
  const target = useStore(reviews, selectTarget)
  const { copied, copy } = useCopy()
  const [open, setOpen] = useKept('comments-sheet', false)

  // Files missing from the current diff keep their comments listed, as outdated.
  const groups = useMemo(() => {
    const byPath = new Map<string, Anchored[]>()
    for (const comment of comments) byPath.set(comment.path, [])
    for (const [path] of byPath) {
      const own = comments.filter((comment) => comment.path === path)
      const item = items.find((entry) => entry.fileDiff.name === path)
      byPath.set(
        path,
        item ? anchorComments(own, item.fileDiff) : own.map((comment) => ({ comment, line: 0, outdated: true })),
      )
    }
    return [...byPath].sort(([a], [b]) => a.localeCompare(b))
  }, [comments, items])

  const jump = (path: string, anchored: Anchored) => {
    setOpen(false)
    viewer.current?.scrollTo(
      anchored.outdated
        ? { type: 'item', id: itemId(path), align: 'start' }
        : { type: 'line', id: itemId(path), lineNumber: anchored.line, side: anchored.comment.side, align: 'center' },
    )
  }

  // A comment whose file left the diff has no line to show it on, so the list is where it can go.
  const remove = async (id: string) => {
    const yes = await ask.confirm({
      title: 'Delete comment',
      body: 'Deletes it from the comments kept on this machine.',
      action: 'Delete',
      destructive: true,
    })
    if (yes)
      await reviews
        .remove(id)
        .catch((error: Error) => toast.error('Could not delete the comment', { description: error.message }))
  }

  const clearOrphaned = async () => {
    const count = orphaned.length
    const yes = await ask.confirm({
      title: `Delete ${count} orphaned comment${count === 1 ? '' : 's'}`,
      body: 'Deletes every comment whose branch is gone. A branch that comes back later comes back without them.',
      action: 'Delete',
      destructive: true,
    })
    if (yes)
      await api
        .clearOrphanedReviews()
        .catch((error: Error) => toast.error('Could not delete the comments', { description: error.message }))
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={orphaned.length ? `Comments, ${fromDeleted(orphaned.length)}` : 'Comments'}
          title={orphaned.length ? `Comments, ${fromDeleted(orphaned.length)}` : 'Comments'}
          className={`shrink-0 ${ICON_ONLY.wide}`}>
          <MessageSquare />
          <span className={LABEL.wide}>Comments</span>
          {comments.length > 0 ? (
            <Badge variant="soft-info" size="sm" className={`rounded-full tabular-nums ${COUNT.wide}`}>
              {comments.length}
            </Badge>
          ) : null}
          {orphaned.length > 0 ? (
            <Badge variant="soft-warning" size="sm" className={`rounded-full tabular-nums ${COUNT.wide}`}>
              {orphaned.length}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[420px] flex-col gap-4 bg-card">
        <SheetHeader>
          <SheetTitle>Comments</SheetTitle>
          <SheetDescription>
            {comments.length === 0
              ? 'No comments on this comparison. Hover a line and choose Comment to add one.'
              : 'Kept on this machine, outside the repo.'}
          </SheetDescription>
          {comments.length > 0 && target ? (
            <Button
              size="sm"
              variant="outline"
              className={`self-start ${copied ? COPIED : ''}`}
              onClick={() => void copy(() => api.reviewPrompt(target))}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'Copied every comment' : 'Copy all as prompt'}
            </Button>
          ) : null}
        </SheetHeader>
        <div className="-mx-2 flex-1 overflow-y-auto">
          {groups.map(([path, entries]) => (
            <section key={path} className="mb-4">
              <h3 className="px-2 pb-1 font-mono text-muted-foreground">{path}</h3>
              <ul>
                {entries.map((anchored) => (
                  <li key={anchored.comment.id} className="flex items-start gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => jump(path, anchored)}
                      className="h-auto min-w-0 flex-1 flex-col items-stretch gap-0.5 px-2 py-1.5 text-start">
                      <span className="text-muted-foreground">
                        {anchored.outdated ? 'Outdated' : `Line ${anchored.line}`}
                      </span>
                      <span className="line-clamp-2 whitespace-normal text-foreground">{anchored.comment.body}</span>
                    </Button>
                    <IconTool
                      destructive
                      label={`Delete comment on ${path}${anchored.outdated ? '' : `, line ${anchored.line}`}`}
                      tip="Delete comment"
                      onClick={() => void remove(anchored.comment.id)}>
                      <Trash2 />
                    </IconTool>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {orphaned.length > 0 ? (
            <Orphaned comments={orphaned} branch={branch} onClear={() => void clearOrphaned()} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Comments whose branch was deleted outside duck-diff. They come back on their own if the branch does; until then
// they can move to the branch checked out, or go.
function Orphaned({
  comments,
  branch,
  onClear,
}: {
  comments: OrphanedComment[]
  branch: string | null
  onClear(): void
}) {
  const { api } = useApp()
  const heading = useId()
  const move = (ids: string[]) =>
    api
      .adoptReviews(ids)
      .catch((error: Error) => toast.error('Could not move the comments', { description: error.message }))
  return (
    <section aria-labelledby={heading} className="mt-2 border-border border-t pt-3">
      <div className="flex items-center gap-2 px-2 pb-1">
        <h3 id={heading} className="flex-1 text-warning">
          From deleted branches
        </h3>
        {branch ? (
          <Button size="sm" variant="outline" onClick={() => void move(comments.map((entry) => entry.id))}>
            <ArrowRightLeft />
            Move all here
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onClear}>
          <Trash2 />
          Delete all
        </Button>
      </div>
      <ul>
        {comments.map((comment) => (
          <li key={comment.id} className="flex items-start gap-1 px-2 py-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-muted-foreground">
                <span className="font-mono">{comment.missing.join(', ')}</span>, {comment.path}
              </span>
              <span className="line-clamp-2 whitespace-normal text-foreground">{comment.body}</span>
            </div>
            {branch ? (
              <IconTool label={`Move to ${branch}`} onClick={() => void move([comment.id])}>
                <ArrowRightLeft />
              </IconTool>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
