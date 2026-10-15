import type { GitHubUser, Reviewer } from '@duck-diff/protocol'
import { Check, CircleDot, Eye, MessageSquare, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from './Conversation'
import { ItemExtras } from './ItemExtras'
import { Labels } from './Labels'

const REVIEW_ICON: Record<NonNullable<Reviewer['state']> | 'requested', ReactNode> = {
  APPROVED: <Check className="size-4 text-added" />,
  CHANGES_REQUESTED: <X className="size-4 text-removed" />,
  COMMENTED: <MessageSquare className="size-4 text-muted-foreground" />,
  DISMISSED: <Eye className="size-4 text-muted-foreground" />,
  PENDING: <CircleDot className="size-4 text-tn-yellow" />,
  requested: <CircleDot className="size-4 text-tn-yellow" />,
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 border-border border-b pb-3 last:border-b-0">
      <h3 className="flex items-center justify-between text-muted-foreground">
        {title}
        {action}
      </h3>
      {children}
    </section>
  )
}

function People({ users, empty }: { users: GitHubUser[]; empty: string }) {
  if (!users.length) return <p className="text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {users.map((user) => (
        <li key={user.login} className="flex items-center gap-2 text-foreground">
          <Avatar user={user} />
          {user.login}
        </li>
      ))}
    </ul>
  )
}

// The column beside a conversation, as GitHub has it. Editing slots in through each section's action.
export function ItemSidebar({
  reviewers,
  assignees,
  labels,
  milestone,
  number,
  actions = {},
}: {
  reviewers?: Reviewer[]
  assignees: GitHubUser[]
  labels: { name: string; color: string }[]
  milestone: string | null
  // Reads linked work, projects and the subscription when given.
  number?: number
  actions?: Partial<Record<'reviewers' | 'assignees' | 'labels' | 'milestone', ReactNode>>
}) {
  return (
    <aside aria-label="Details" className="flex flex-col gap-3 self-start lg:sticky lg:top-4">
      {reviewers ? (
        <Section title="Reviewers" action={actions.reviewers}>
          {reviewers.length ? (
            <ul className="flex flex-col gap-1.5">
              {reviewers.map((reviewer) => (
                <li key={reviewer.login} className="flex items-center gap-2 text-foreground">
                  <Avatar user={reviewer} />
                  <span className="min-w-0 flex-1 truncate">{reviewer.login}</span>
                  {REVIEW_ICON[reviewer.state ?? 'requested']}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No reviews</p>
          )}
        </Section>
      ) : null}
      <Section title="Assignees" action={actions.assignees}>
        <People users={assignees} empty="No one assigned" />
      </Section>
      <Section title="Labels" action={actions.labels}>
        {labels.length ? (
          <div className="flex flex-wrap gap-1">
            <Labels labels={labels} />
          </div>
        ) : (
          <p className="text-muted-foreground">None yet</p>
        )}
      </Section>
      <Section title="Milestone" action={actions.milestone}>
        <p className={milestone ? 'text-foreground' : 'text-muted-foreground'}>{milestone ?? 'No milestone'}</p>
      </Section>
      {number === undefined ? null : <ItemExtras number={number} />}
    </aside>
  )
}
