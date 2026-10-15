import {
  CircleCheck,
  CircleDot,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react'

// GitHub's state pill: solid green open, purple merged or done, red closed, grey draft.
export function StatePill({
  kind,
  state,
  merged = false,
  draft = false,
}: {
  kind: 'pr' | 'issue'
  state: 'open' | 'closed'
  merged?: boolean
  draft?: boolean
}) {
  const look =
    kind === 'issue'
      ? state === 'open'
        ? { icon: CircleDot, text: 'Open', className: 'bg-added' }
        : { icon: CircleCheck, text: 'Closed', className: 'bg-tn-magenta' }
      : merged
        ? { icon: GitMerge, text: 'Merged', className: 'bg-tn-magenta' }
        : state === 'closed'
          ? { icon: GitPullRequestClosed, text: 'Closed', className: 'bg-removed' }
          : draft
            ? { icon: GitPullRequestDraft, text: 'Draft', className: 'bg-tn-dark5' }
            : { icon: GitPullRequest, text: 'Open', className: 'bg-added' }
  return (
    <span className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[var(--background)] ${look.className}`}>
      <look.icon className="size-4" />
      {look.text}
    </span>
  )
}
