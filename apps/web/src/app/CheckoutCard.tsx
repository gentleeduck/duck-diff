import type { Worktree } from '@duck-diff/protocol'
import { Badge, type BadgeTone, HoverCard, HoverCardContent, HoverCardTrigger } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { FolderGit2, GitBranch } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { relativeTime } from '../sidebar/relative-time'
import { useApp } from './AppProvider'
import { CopyTool } from './CopyTool'
import { TextLine } from './skeletons'

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

// One labelled line of a card: what it is on the left, the value beside it.
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</dd>
    </>
  )
}

// What git says about the checkout now: its branch against its upstream, the commit it is on, and what differs.
function CheckoutFacts({ path }: { path: string }) {
  const { queries } = useApp()
  const read = useQuery({ ...queries.git.checkout(path), retry: false })
  if (read.isError) return <p className="text-muted-foreground">Git could not read this checkout.</p>
  const info = read.data
  if (!info)
    return (
      <div role="status" className="flex flex-col gap-1.5" aria-label="Reading the checkout">
        <TextLine className="w-48" />
        <TextLine className="w-64" />
        <TextLine className="w-24" />
      </div>
    )
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
      <Fact label="Branch">
        <GitBranch className="size-4 shrink-0 self-center text-tn-blue" />
        <span className="min-w-0 break-all text-foreground">{info.branch ?? 'detached'}</span>
        {info.ahead ? (
          <Badge variant="soft-info" size="sm" title={`${info.ahead} to push`}>
            {info.ahead} ahead
          </Badge>
        ) : null}
        {info.behind ? (
          <Badge variant="soft-warning" size="sm" title={`${info.behind} to pull`}>
            {info.behind} behind
          </Badge>
        ) : null}
        {info.upstream ? <span className="min-w-0 break-all text-muted-foreground">on {info.upstream}</span> : null}
      </Fact>
      <Fact label="Commit">
        {info.head ? (
          <>
            <span className="shrink-0 font-mono text-tn-blue">{info.head.sha.slice(0, 7)}</span>
            <span className="min-w-0 text-foreground">{info.head.subject}</span>
            <span className="text-muted-foreground">
              {info.head.author}, {relativeTime(info.head.committedAt)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">No commits yet</span>
        )}
      </Fact>
      <Fact label="Changes">
        {info.changes ? (
          <Badge variant="soft-warning" size="sm">
            {info.changes} {info.changes === 1 ? 'file' : 'files'} changed
          </Badge>
        ) : (
          <Badge variant="soft-success" size="sm">
            clean
          </Badge>
        )}
      </Fact>
    </dl>
  )
}

export function CheckoutCard({
  title,
  path,
  kind,
  hint,
  tag = null,
}: {
  title: string
  path: string
  kind: string
  hint: string | null
  tag?: TreeTag | null
}) {
  return (
    <>
      <header className="flex items-center gap-2">
        <FolderGit2 className="size-4 shrink-0 text-tn-blue" />
        <span className="min-w-0 flex-1 break-all font-bold text-foreground">{title}</span>
        {tag ? (
          <Badge variant={TAG_TONE[tag]} size="sm">
            {tag}
          </Badge>
        ) : null}
      </header>
      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 ps-2">
        <span className="min-w-0 flex-1 break-all py-1 font-mono text-muted-foreground">{path}</span>
        <CopyTool label="Copy the path" text={path} />
      </div>
      {/* A folder that is gone has nothing for git to read. */}
      {tag === 'missing' ? null : <CheckoutFacts path={path} />}
      <p className="text-muted-foreground">{kind}</p>
      {hint ? <p className="border-border border-t pt-2 text-tn-comment">{hint}</p> : null}
    </>
  )
}

export function WorktreeCard({ tree }: { tree: Worktree }) {
  const openable = !tree.current && !tree.prunable
  return (
    <CheckoutCard
      title={tree.path.split('/').pop() || tree.path}
      path={tree.path}
      kind={treeKind(tree)}
      tag={treeTag(tree)}
      hint={tree.current ? 'You are here.' : openable ? 'Click to open it in its own window.' : null}
    />
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
