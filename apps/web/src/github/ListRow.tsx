import type { ListItem } from '@duck-diff/protocol'
import { Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, Dot, MessageSquare, Milestone, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from './Conversation'
import { IssueIcon } from './IssuesList'
import { Labels } from './Labels'
import { PullIcon } from './PullsList'
import { ago } from './time'

const REVIEW: Record<NonNullable<ListItem['review']>, { className: string; text: string }> = {
  APPROVED: { className: 'text-added', text: 'Approved' },
  CHANGES_REQUESTED: { className: 'text-removed', text: 'Changes requested' },
  REVIEW_REQUIRED: { className: 'text-tn-yellow', text: 'Review required' },
}

const CHECKS: Record<NonNullable<ListItem['checks']>, { icon: ReactNode; text: string }> = {
  SUCCESS: { icon: <Check className="size-4 text-added" />, text: 'Checks passed' },
  FAILURE: { icon: <X className="size-4 text-removed" />, text: 'Checks failed' },
  ERROR: { icon: <X className="size-4 text-removed" />, text: 'Checks errored' },
  PENDING: { icon: <Dot className="size-5 text-tn-yellow" />, text: 'Checks running' },
  EXPECTED: { icon: <Dot className="size-5 text-tn-yellow" />, text: 'Checks waiting' },
}

function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={text} className="flex shrink-0 items-center gap-1">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

// GitHub's second line: when it opened, or when and how it closed, and by whom.
function told(item: ListItem): string {
  const by = item.author.login
  if (item.state === 'open') return `#${item.number} opened ${ago(item.createdAt || item.updatedAt)} by ${by}`
  const when = ago(item.closedAt ?? item.updatedAt)
  return `#${item.number} by ${by} was ${item.merged ? 'merged' : 'closed'} ${when}`
}

// One row shape for pull requests and issues, laid out like GitHub's lists.
export function ListRow({ item, kind }: { item: ListItem; kind: 'pr' | 'issue' }) {
  return (
    <>
      <span className="pt-0.5">{kind === 'pr' ? <PullIcon pull={item} /> : <IssueIcon state={item.state} />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 font-bold text-foreground">{item.title}</span>
          {item.checks ? <Hint text={CHECKS[item.checks].text}>{CHECKS[item.checks].icon}</Hint> : null}
          <Labels labels={item.labels} />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <span>{told(item)}</span>
          {item.draft ? <span>· Draft</span> : null}
          {item.review && item.state === 'open' ? (
            <span className={REVIEW[item.review].className}>· {REVIEW[item.review].text}</span>
          ) : null}
          {item.milestone ? (
            <Hint text={`Milestone ${item.milestone}`}>
              <Milestone className="size-3.5" />
              <span className="max-w-40 truncate">{item.milestone}</span>
            </Hint>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-start gap-3 pt-0.5 text-muted-foreground">
        {item.assignees.length ? (
          <Hint text={`Assigned to ${item.assignees.map((user) => user.login).join(', ')}`}>
            <span className="flex -space-x-1.5">
              {item.assignees.slice(0, 3).map((user) => (
                <Avatar key={user.login} user={user} />
              ))}
            </span>
          </Hint>
        ) : null}
        <span className="w-10 text-end">
          {item.comments ? (
            <Hint text={`${item.comments} comments`}>
              <MessageSquare className="size-4" />
              {item.comments}
            </Hint>
          ) : null}
        </span>
      </span>
    </>
  )
}
