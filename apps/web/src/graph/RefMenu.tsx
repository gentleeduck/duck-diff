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
  Download,
  FileDiff,
  GitBranchPlus,
  GitCompareArrows,
  GitMerge,
  GitPullRequestArrow,
  Link,
  LocateFixed,
  PackageOpen,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { ask } from '../app/Ask'
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
  const slash = name.indexOf('/')
  const remoteName = kind === 'remote' && slash > 0 ? name.slice(0, slash) : null
  const remoteBranch = remoteName ? name.slice(slash + 1) : null
  const rename = async () => {
    const values = await ask.prompt({
      title: `Rename ${name}`,
      fields: [{ name: 'to', label: 'New name', initial: name }],
      action: 'Rename',
    })
    if (values && values.to !== name)
      await run('branch-rename', { from: name, to: values.to }, `Renamed to ${values.to}`)
  }
  const upstream = async () => {
    const values = await ask.prompt({
      title: `Upstream for ${name}`,
      body: 'The remote branch this one pulls from and pushes to.',
      // The checked-out branch shows what it tracks now; the graph knows only that one's.
      fields: [
        {
          name: 'upstream',
          label: 'Remote branch',
          placeholder: `origin/${name}`,
          initial: name === current ? (status?.upstream ?? undefined) : undefined,
        },
      ],
      action: 'Set upstream',
    })
    if (values)
      await run('set-upstream', { branch: name, upstream: values.upstream }, `${name} now tracks ${values.upstream}`)
  }
  const deleteRemote = async () => {
    if (!remoteName || !remoteBranch) return
    const yes = await ask.confirm({
      title: `Delete ${name}`,
      body: `Deletes the branch ${remoteBranch} on ${remoteName} for everyone.`,
      action: 'Delete on remote',
      destructive: true,
    })
    if (yes) await run('remote-branch-delete', { remote: remoteName, branch: remoteBranch }, `Deleted ${name}`)
  }
  const compare = () => {
    navigate({ kind: 'range', from: current ?? 'HEAD', to: name, mode: 'merge-base' })
    show('changes')
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
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
                  <>
                    <ContextMenuItem
                      onSelect={() => void run('merge', { ref: name }, `Merged ${name} into ${current}`)}>
                      <GitMerge />
                      Merge into {current}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => void run('rebase', { onto: name }, `Rebased ${current} onto ${name}`)}>
                      <GitPullRequestArrow />
                      Rebase {current} onto it
                    </ContextMenuItem>
                  </>
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
            {kind === 'branch' ? (
              <>
                <ContextMenuItem onSelect={() => void rename()}>
                  <Pencil />
                  Rename...
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void upstream()}>
                  <Link />
                  Set upstream...
                </ContextMenuItem>
              </>
            ) : null}
            {kind === 'remote' ? (
              <>
                <ContextMenuItem onSelect={() => void run('track', { ref: name }, `Checked out ${remoteBranch}`)}>
                  <Download />
                  Check out as {remoteBranch}
                </ContextMenuItem>
                <ContextMenuItem destructive onSelect={() => void deleteRemote()}>
                  <Trash2 />
                  Delete on {remoteName}...
                </ContextMenuItem>
              </>
            ) : null}
            {kind === 'tag' ? (
              <>
                <ContextMenuItem onSelect={() => void run('tag-push', { remote: 'origin', name }, `Pushed ${name}`)}>
                  <Upload />
                  Push to origin
                </ContextMenuItem>
                <ContextMenuItem destructive onSelect={() => void run('tag-delete', { name }, `Deleted ${name}`)}>
                  <Trash2 />
                  Delete tag
                </ContextMenuItem>
              </>
            ) : null}
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
