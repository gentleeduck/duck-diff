import { Button, Popover, PopoverContent, PopoverTrigger, Textarea } from '@duck-diff/ui'
import { Check, MessageSquare, ScanEye, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { COMPARE } from '../app/fit'
import type { ReviewEvent } from '../lib/api'
import { fitRows } from '../lib/fit-rows'
import { useStore } from '../lib/store'
import type { PullReviewState } from './pull-review'

const selectCount = (state: PullReviewState) => state.pending.length
const selectNumber = (state: PullReviewState) => state.number

const EVENTS: { event: ReviewEvent; label: string; icon: typeof Check }[] = [
  { event: 'COMMENT', label: 'Comment', icon: MessageSquare },
  { event: 'APPROVE', label: 'Approve', icon: Check },
  { event: 'REQUEST_CHANGES', label: 'Request changes', icon: X },
]

// GitHub's "Review changes": a summary and a verdict, sent with every comment gathered on the diff.
// fit: in the compare bar, where the button folds to its icon as the bar narrows.
export function ReviewChanges({ fit = false }: { fit?: boolean }) {
  const { pullReview } = useApp()
  const pending = useStore(pullReview, selectCount)
  const number = useStore(pullReview, selectNumber)
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<ReviewEvent | null>(null)
  if (number === null) return null

  const submit = async (event: ReviewEvent) => {
    setBusy(event)
    try {
      await pullReview.submit(event, body)
      toast(event === 'APPROVE' ? 'Approved' : event === 'REQUEST_CHANGES' ? 'Requested changes' : 'Review sent')
      setBody('')
      setOpen(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          aria-label="Review changes"
          title="Review changes"
          className={`shrink-0 ${fit ? COMPARE.icon : ''}`}>
          <ScanEye />
          <span className={fit ? COMPARE.label : undefined}>Review changes</span>
          {pending ? (
            <span className={`rounded-full bg-background/30 px-1.5 tabular-nums ${fit ? COMPARE.count : ''}`}>
              {pending}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[28rem] flex-col gap-3">
        <p className="text-foreground">Finish your review</p>
        <Textarea
          aria-label="Review summary"
          placeholder="Leave a comment"
          rows={fitRows(body, 6, 18)}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <p className="text-muted-foreground">
          {pending
            ? `${pending} pending ${pending === 1 ? 'comment' : 'comments'} will be sent with it.`
            : 'No line comments yet; add some from the diff with "Add to review".'}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {EVENTS.map(({ event, label, icon: Icon }) => (
            <Button
              key={event}
              size="sm"
              variant={event === 'APPROVE' ? 'default' : 'outline'}
              loading={busy === event}
              disabled={event === 'COMMENT' && !body.trim() && !pending}
              onClick={() => void submit(event)}>
              <Icon />
              {label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
