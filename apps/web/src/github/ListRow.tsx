import type { ListItem } from '@duck-diff/protocol'
import { Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { Check, CircleDot, MessageSquare, Milestone, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from './Conversation'
import { IssueIcon } from './IssuesSidebar'
import { Labels } from './Labels'
import { PullIcon } from './PullsSidebar'
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

// One row shape for pull requests and issues, with GitHub's at-a-glance signals on the right.
export function ListRow({ item, kind }: { item: ListItem; kind: 'pr' | 'issue' }) {
  return (
    <>
      <span className="pt-1">{kind === 'pr' ? <PullIcon pull={item} /> : <IssueIcon state={item.state} />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
          {item.checks ? (
            <Hint text={CHECKS[item.checks].text}>
              <span className={`size-2 rounded-full ${CHECKS[item.checks].className}`} />
            </Hint>
          ) : null}
          {item.review ? <Hint text={REVIEW[item.review].text}>{REVIEW[item.review].icon}</Hint> : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="shrink-0">#{item.number}</span>
          <span className="min-w-0 truncate">
            {item.author.login} · {ago(item.updatedAt)}
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-2">
            {item.comments ? (
              <Hint text={`${item.comments} comments`}>
                <MessageSquare className="size-3.5" />
                {item.comments}
              </Hint>
            ) : null}
            {item.assignees.length ? (
              <Hint text={`Assigned to ${item.assignees.map((user) => user.login).join(', ')}`}>
                {item.assignees.slice(0, 3).map((user) => (
                  <Avatar key={user.login} user={user} />
                ))}
              </Hint>
            ) : null}
          </span>
        </span>
        {item.labels.length || item.milestone ? (
          <span className="flex items-center gap-1 overflow-hidden">
            {item.milestone ? (
              <Hint text={`Milestone ${item.milestone}`}>
                <Milestone className="size-3.5 text-muted-foreground" />
                <span className="max-w-28 truncate text-muted-foreground">{item.milestone}</span>
              </Hint>
            ) : null}
            <Labels labels={item.labels} max={2} />
          </span>
        ) : null}
      </span>
    </>
  )
}
