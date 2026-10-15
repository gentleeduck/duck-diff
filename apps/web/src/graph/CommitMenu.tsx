import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@duck-diff/ui'
import { Cherry, Copy, FileDiff, GitBranchPlus, GitCompareArrows, LocateFixed, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { relativeTime } from '../sidebar/relative-time'
import { useCommitActions } from './commit-actions'
import type { GraphEntry } from './records'

export function CommitMenu({
  entry,
  onNewBranch,
  children,
}: {
  entry: GraphEntry
  onNewBranch(sha: string): void
  children: ReactNode
}) {
  const actions = useCommitActions()
  const { sha } = entry
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>
          {sha.slice(0, 7)} {entry.subject}
        </ContextMenuLabel>
        <ContextMenuItem onSelect={() => actions.showChanges(sha)}>
          <FileDiff />
          Show changes
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.compareWithHead(sha)}>
          <GitCompareArrows />
          Compare with HEAD
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onNewBranch(sha)}>
          <GitBranchPlus />
          New branch here...
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.checkout(sha)}>
          <LocateFixed />
          Checkout
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.cherryPick(sha)}>
          <Cherry />
          Cherry-pick
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.revert(sha)}>
          <Undo2 />
          Revert
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void actions.copy(sha, 'sha')}>
          <Copy />
          Copy sha
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.copy(entry.subject, 'message')}>
          <Copy />
          Copy message
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Hovering a commit's dot shows who made it and when, without opening the panel.
export function CommitHover({
  entry,
  avatar,
  initials,
  children,
}: {
  entry: GraphEntry
  avatar: string | null
  initials: string
  children: ReactNode
}) {
  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="flex w-96 flex-col gap-2">
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={`${avatar}${avatar.includes('?') ? '&' : '?'}s=80`} alt="" className="size-10 rounded-full" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-tn-blue">
              {initials}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-foreground">{entry.author}</p>
            <p className="truncate text-muted-foreground">{entry.email}</p>
          </div>
        </div>
        <p className="text-foreground">{entry.subject}</p>
        <p className="text-muted-foreground">
          <span className="text-tn-comment">{entry.sha.slice(0, 10)}</span> ·{' '}
          {new Date(entry.time * 1000).toLocaleString()} ({relativeTime(entry.time)})
        </p>
        {entry.parents.length > 1 ? <p className="text-tn-magenta">Merge of {entry.parents.length} parents</p> : null}
        {entry.refs.length ? (
          <p className="text-muted-foreground">{entry.refs.map((ref) => ref.name).join(', ')}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}
