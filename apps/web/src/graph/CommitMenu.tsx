import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  HoverCard,
  HoverCardContent,
} from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import {
  Bug,
  Cherry,
  Copy,
  FileDiff,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompareArrows,
  History,
  ListOrdered,
  LocateFixed,
  SquareArrowOutUpRight,
  Tag,
  Undo2,
  Wrench,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useGitHub } from '../github/SignIn'
import { relativeTime } from '../sidebar/relative-time'
import { useCommitActions } from './commit-actions'
import type { GraphEntry } from './records'

export function CommitMenu({
  entry,
  onNewBranch,
  onRebase,
  children,
}: {
  entry: GraphEntry
  onNewBranch(sha: string): void
  onRebase(sha: string): void
  children: ReactNode
}) {
  const actions = useCommitActions()
  const { sha } = entry
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
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
        <ContextMenuItem onSelect={() => void actions.tag(sha)}>
          <Tag />
          Create tag here...
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onRebase(sha)}>
          <ListOrdered />
          Rebase interactively onto this...
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.fixup(sha)}>
          <Wrench />
          Fix up with staged changes
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Bug />
            Bisect
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            <ContextMenuItem onSelect={() => void actions.bisect('bad', sha)}>Mark as bad</ContextMenuItem>
            <ContextMenuItem onSelect={() => void actions.bisect('good', sha)}>Mark as good</ContextMenuItem>
            <ContextMenuItem onSelect={() => void actions.bisect('skip', sha)}>Skip this commit</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <History />
            Reset current branch here
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-64">
            <ContextMenuItem onSelect={() => void actions.reset(sha, 'soft')}>
              Soft: keep changes staged
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void actions.reset(sha, 'mixed')}>
              Mixed: keep changes unstaged
            </ContextMenuItem>
            <ContextMenuItem destructive onSelect={() => void actions.reset(sha, 'hard')}>
              Hard: discard changes...
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
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

interface HoverDetails {
  message: string
  files: number
  additions: number
  deletions: number
}

// Read when the card opens, or earlier when the row was hovered; cached ones show at once.
function useHoverDetails(sha: string, open: boolean): HoverDetails | null {
  const { queries } = useApp()
  const commit = useQuery({ ...queries.git.commit(sha), enabled: open }).data
  const stat = useQuery({ ...queries.git.commitStat(sha), enabled: open }).data
  return commit && stat ? { message: commit.message, ...stat } : null
}

// Git wraps messages at about 72 columns; the card joins those lines back into paragraphs, keeping
// blank lines, list items and indented lines where they are.
export function reflow(body: string): string {
  const lines = body.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const previous = out.at(-1)
    const joins =
      previous !== undefined &&
      previous.trim() !== '' &&
      line.trim() !== '' &&
      !/^\s*([-*+]|\d+[.)])\s/.test(line) &&
      !/^\s/.test(line)
    if (joins) out[out.length - 1] = `${previous} ${line.trim()}`
    else out.push(line)
  }
  return out.join('\n')
}

// Its children hold the HoverCardTrigger, so the same row can also be a right-click trigger.
// Hovering a commit shows who made it and when, its whole message and its size, like an editor's graph.
export function CommitHover({
  entry,
  avatar,
  children,
}: {
  entry: GraphEntry
  avatar: string | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const info = useHoverDetails(entry.sha, open)
  const github = useGitHub()
  // A click or a right-click means the reader moved on to the row's actions; the card would cover them.
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (!(event.target as Element | null)?.closest?.('[data-slot="hover-card-content"]')) setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('contextmenu', close, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('contextmenu', close, true)
    }
  }, [open])
  const { copy } = useCommitActions()
  const [subject = entry.subject, ...rest] = (info?.message ?? entry.subject).split('\n')
  const body = reflow(rest.join('\n').trim())
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={500} closeDelay={100}>
      {children}
      <HoverCardContent
        side="bottom"
        align="center"
        className="flex w-[40rem] max-w-[calc(100vw-2rem)] flex-col gap-2 p-0">
        <div className="flex items-center gap-2 px-3 pt-3">
          {avatar ? (
            <img src={`${avatar}${avatar.includes('?') ? '&' : '?'}s=48`} alt="" className="size-6 rounded-full" />
          ) : null}
          <span className="text-tn-blue">{entry.author},</span>
          <History className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {relativeTime(entry.time)} ({new Date(entry.time * 1000).toLocaleString()})
          </span>
        </div>
        <div className="flex flex-col gap-1 px-3">
          <p className="text-foreground">{subject}</p>
          {body ? <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{body}</p> : null}
        </div>
        <div className="border-border border-t px-3 pt-2 text-muted-foreground">
          {info ? (
            <>
              {info.files} {info.files === 1 ? 'file' : 'files'} changed,{' '}
              <span className="text-added">{info.additions.toLocaleString()} insertions(+)</span>,{' '}
              <span className="text-removed">{info.deletions.toLocaleString()} deletions(-)</span>
            </>
          ) : (
            'Reading the change...'
          )}
        </div>
        <div className="flex items-center gap-3 border-border border-t px-3 py-2">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-tn-blue"
            onClick={() => void copy(entry.sha, 'sha')}>
            <GitCommitHorizontal className="size-4" />
            {entry.sha.slice(0, 7)}
            <Copy className="size-3.5 text-muted-foreground" />
          </button>
          {github.status?.repo ? (
            <a
              href={`https://github.com/${github.status.repo}/commit/${entry.sha}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-tn-blue hover:underline">
              <SquareArrowOutUpRight className="size-4" />
              Open on GitHub
            </a>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
