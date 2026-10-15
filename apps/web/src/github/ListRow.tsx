import type { ListItem } from '@duck-diff/protocol'
import { Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, CircleDot, MessageSquare, Milestone, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from './Conversation'
import { IssueIcon } from './IssuesList'
import { Labels } from './Labels'
import { PullIcon } from './PullsList'
import { ago } from './time'

const REVIEW: Record<NonNullable<ListItem['review']>, { icon: ReactNode; text: string }> = {
  APPROVED: { icon: <Check className="size-4 text-added" />, text: 'Approved' },
  CHANGES_REQUESTED: { icon: <X className="size-4 text-removed" />, text: 'Changes requested' },
  REVIEW_REQUIRED: { icon: <CircleDot className="size-4 text-tn-yellow" />, text: 'Review required' },
}

const CHECKS: Record<NonNullable<ListItem['checks']>, { className: string; text: string }> = {
  SUCCESS: { className: 'bg-added', text: 'Checks passed' },
  FAILURE: { className: 'bg-removed', text: 'Checks failed' },
  ERROR: { className: 'bg-removed', text: 'Checks errored' },
  PENDING: { className: 'bg-tn-yellow', text: 'Checks running' },
  EXPECTED: { className: 'bg-tn-yellow', text: 'Checks waiting' },
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

// One row shape for pull requests and issues, laid out like GitHub's lists.
export function ListRow({ item, kind }: { item: ListItem; kind: 'pr' | 'issue' }) {
  return (
    <>
      <span className="pt-0.5">{kind === 'pr' ? <PullIcon pull={item} /> : <IssueIcon state={item.state} />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 text-foreground">{item.title}</span>
          {item.checks ? (
            <Hint text={CHECKS[item.checks].text}>
              <span className={`size-2 rounded-full ${CHECKS[item.checks].className}`} />
            </Hint>
          ) : null}
          <Labels labels={item.labels} />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="truncate">
            #{item.number} {item.draft ? 'draft' : item.merged ? 'merged' : item.state === 'open' ? 'open' : 'closed'} ·
            updated {ago(item.updatedAt)} by {item.author.login}
          </span>
          {item.milestone ? (
            <Hint text={`Milestone ${item.milestone}`}>
              <Milestone className="size-3.5" />
              <span className="max-w-40 truncate">{item.milestone}</span>
            </Hint>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-start gap-3 pt-0.5 text-muted-foreground">
        {item.review ? <Hint text={REVIEW[item.review].text}>{REVIEW[item.review].icon}</Hint> : null}
        {item.assignees.length ? (
          <Hint text={`Assigned to ${item.assignees.map((user) => user.login).join(', ')}`}>
            {item.assignees.slice(0, 3).map((user) => (
              <Avatar key={user.login} user={user} />
            ))}
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
