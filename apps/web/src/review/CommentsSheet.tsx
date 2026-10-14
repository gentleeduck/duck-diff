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
import { MessageSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { itemId } from '../lib/items'
import { useStore } from '../lib/store'
import type { SessionState } from '../state/session'
import { type Anchored, anchorComments } from './anchor'
import type { ReviewsState } from './reviews'

const selectItems = (state: SessionState) => state.items
const selectComments = (state: ReviewsState) => state.comments

export function CommentsSheet() {
  const { reviews, viewer } = useApp()
  const items = useSession(selectItems)
  const comments = useStore(reviews, selectComments)
  const [open, setOpen] = useState(false)

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageSquare />
          Comments
          {comments.length > 0 ? <Badge size="sm">{comments.length}</Badge> : null}
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
        </SheetHeader>
        <div className="-mx-2 flex-1 overflow-y-auto">
          {groups.map(([path, entries]) => (
            <section key={path} className="mb-4">
              <h3 className="px-2 pb-1 font-mono text-muted-foreground">{path}</h3>
              <ul>
                {entries.map((anchored) => (
                  <li key={anchored.comment.id}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => jump(path, anchored)}
                      className="h-auto w-full flex-col items-stretch gap-0.5 px-2 py-1.5 text-start">
                      <span className="text-muted-foreground">
                        {anchored.outdated ? 'Outdated' : `Line ${anchored.line}`}
                      </span>
                      <span className="line-clamp-2 whitespace-normal text-foreground">{anchored.comment.body}</span>
                    </Button>
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
