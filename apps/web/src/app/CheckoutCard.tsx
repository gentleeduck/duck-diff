import type { Worktree } from '@duck-diff/protocol'
import { type BadgeTone, HoverCard, HoverCardContent, HoverCardTrigger } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { GitCommitHorizontal } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { relativeTime } from '../sidebar/relative-time'
import { useApp } from './AppProvider'

export type TreeTag = 'here' | 'missing' | 'separate' | 'locked'

// The few words a checkout's row carries at its end.
export const treeTag = (tree: Worktree): TreeTag | null =>
  tree.current ? 'here' : tree.prunable ? 'missing' : tree.separate ? 'separate' : tree.locked ? 'locked' : null

export const TAG_TONE: Record<TreeTag, BadgeTone> = {
  here: 'soft-success',
  missing: 'soft-destructive',
  separate: 'soft-info',
  locked: 'soft-warning',
}

const treeKind = (tree: Worktree) =>
  tree.prunable
    ? 'Missing: its folder is gone. Prune worktrees to forget it.'
    : tree.separate
      ? "A separate copy: git does not list it as one of this repo's worktrees."
      : tree.main
        ? "This repo's main checkout."
        : 'A worktree of this repo.'

// The commit a checkout is on; a separate copy's may not be in this repo, and then only its hash shows.
function HeadCommit({ sha }: { sha: string | null }) {
  const { queries } = useApp()
  const commit = useQuery({ ...queries.git.commit(sha ?? ''), enabled: Boolean(sha), retry: false }).data
  if (!sha) return <p className="text-muted-foreground">No commits yet.</p>
  return (
    <p className="flex min-w-0 items-center gap-2">
      <GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-mono text-tn-blue">{sha.slice(0, 7)}</span>
      {commit ? (
        <>
          <span className="min-w-0 truncate">{commit.message.split('\n')[0]}</span>
          <span className="shrink-0 text-muted-foreground">{relativeTime(commit.committedAt)}</span>
        </>
      ) : null}
    </p>
  )
}

export function CheckoutCard({
  title,
  path,
  kind,
  hint,
  children,
}: {
  title: string
  path: string
  kind: string
  hint: string | null
  children?: ReactNode
}) {
  return (
    <>
      <p className="break-all text-foreground">{title}</p>
      <p className="break-all text-muted-foreground">{path}</p>
      {children}
      <p className="text-muted-foreground">{kind}</p>
      {hint ? <p className="border-border border-t pt-2 text-tn-comment">{hint}</p> : null}
    </>
  )
}

export function WorktreeCard({ tree }: { tree: Worktree }) {
  const openable = !tree.current && !tree.prunable
  return (
    <CheckoutCard
      title={tree.branch ?? tree.head?.slice(0, 7) ?? 'detached'}
      path={tree.path}
      kind={treeKind(tree)}
      hint={tree.current ? 'You are here.' : openable ? 'Click to open it in its own window.' : null}>
      <HeadCommit sha={tree.head} />
    </CheckoutCard>
  )
}

// A checkout's row with its card on hover. The card's reads wait until it first opens.
export function CheckoutHover({ card, children }: { card: ReactNode; children: ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <HoverCard open={shown} onOpenChange={setShown} openDelay={400} closeDelay={80}>
      {/* The card says it all; the page's tooltip for cut-off text stays out of its way. */}
      <HoverCardTrigger asChild data-own-tooltip="">
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col gap-2 p-3">
        {shown ? card : null}
      </HoverCardContent>
    </HoverCard>
  )
}
