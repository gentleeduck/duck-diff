import { Badge } from '@duck-diff/ui'
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
        ? { icon: CircleDot, text: 'Open', variant: 'success' as const }
        : { icon: CircleCheck, text: 'Closed', variant: 'done' as const }
      : merged
        ? { icon: GitMerge, text: 'Merged', variant: 'done' as const }
        : state === 'closed'
          ? { icon: GitPullRequestClosed, text: 'Closed', variant: 'destructive' as const }
          : draft
            ? { icon: GitPullRequestDraft, text: 'Draft', variant: 'secondary' as const }
            : { icon: GitPullRequest, text: 'Open', variant: 'success' as const }
  return (
    <Badge variant={look.variant} size="lg" className="h-7 gap-1.5 rounded-full">
      <look.icon className="size-4" />
      {look.text}
    </Badge>
  )
}
