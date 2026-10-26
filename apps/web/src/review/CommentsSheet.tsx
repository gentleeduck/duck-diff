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
import { Check, Copy, MessageSquare, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { COPIED, useCopy } from '../app/CopyTool'
import { COUNT, ICON_ONLY, LABEL } from '../app/fit'
import { IconTool } from '../app/IconTool'
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

export function CommentsSheet() {
  const { api, reviews, viewer } = useApp()
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label="Comments"
          title="Comments"
          className={`shrink-0 ${ICON_ONLY.wide}`}>
          <MessageSquare />
          <span className={LABEL.wide}>Comments</span>
          {comments.length > 0 ? (
            <Badge variant="soft-info" size="sm" className={`rounded-full tabular-nums ${COUNT.wide}`}>
              {comments.length}
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
