import type { Ref } from '@duck-diff/protocol'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@duck-diff/ui'
import {
  ArchiveRestore,
  ArrowRightLeft,
  Copy,
  FileDiff,
  GitBranchPlus,
  GitCompareArrows,
  GitMerge,
  LocateFixed,
  PackageOpen,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useCommitActions } from './commit-actions'

// Right-click on a branch, remote branch, tag or stash in the graph sidebar.
export function RefMenu({
  refEntry,
  onNewBranch,
  children,
}: {
  refEntry: Ref
  onNewBranch(sha: string): void
  children: ReactNode
}) {
  const { status, run } = useGit()
  const { navigate } = useTarget()
  const { show } = useView()
  const commit = useCommitActions()
  const { name, kind, sha } = refEntry
  const current = status?.branch
  const compare = () => {
    navigate({ kind: 'range', from: current ?? 'HEAD', to: name, mode: 'merge-base' })
    show('changes')
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>{name}</ContextMenuLabel>
        {kind === 'stash' ? (
          <>
            <ContextMenuItem onSelect={() => commit.showChanges(sha)}>
              <FileDiff />
              Show changes
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void run('stash-apply', { name, pop: false }, `Applied ${name}`)}>
              <ArchiveRestore />
              Apply
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void run('stash-apply', { name, pop: true }, `Popped ${name}`)}>
              <PackageOpen />
              Pop
            </ContextMenuItem>
          </>
        ) : (
          <>
            {kind === 'branch' && !refEntry.current ? (
              <ContextMenuItem
                onSelect={() => void run('switch', { branch: name, create: false }, `Switched to ${name}`)}>
                <ArrowRightLeft />
                Switch to {name}
              </ContextMenuItem>
            ) : null}
            {kind !== 'branch' || !refEntry.current ? (
              <>
                <ContextMenuItem onSelect={compare}>
                  <GitCompareArrows />
                  What it adds to {current ?? 'HEAD'}
                </ContextMenuItem>
                {current ? (
                  <ContextMenuItem onSelect={() => void run('merge', { ref: name }, `Merged ${name} into ${current}`)}>
                    <GitMerge />
                    Merge into {current}
                  </ContextMenuItem>
                ) : null}
              </>
            ) : null}
            <ContextMenuItem onSelect={() => onNewBranch(sha)}>
              <GitBranchPlus />
              New branch here...
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void commit.checkout(sha)}>
              <LocateFixed />
              Checkout its commit
            </ContextMenuItem>
            {kind === 'branch' && !refEntry.current ? (
              <ContextMenuItem
                destructive
                onSelect={() => void run('branch-delete', { name, force: false }, `Deleted ${name}`)}>
                <Trash2 />
                Delete if merged
              </ContextMenuItem>
            ) : null}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void commit.copy(name, 'name')}>
          <Copy />
          Copy name
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void commit.copy(sha, 'sha')}>
          <Copy />
          Copy sha
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
