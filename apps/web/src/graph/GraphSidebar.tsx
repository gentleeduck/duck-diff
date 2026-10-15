import type { Ref } from '@duck-diff/protocol'
import { Button, Label, Popover, PopoverContent, PopoverTrigger, Switch } from '@duck-diff/ui'
import { ArchiveRestore, ArrowRightLeft, FileDiff, GitMerge, PackageOpen, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'
import { useRefs } from '../hooks/useRefs'
import { useStore } from '../lib/store'
import { useCommitActions } from './commit-actions'
import { NewBranchDialog } from './NewBranchDialog'
import { RefMenu } from './RefMenu'
import { Remotes } from './Remotes'
import type { GraphState } from './store'

const GROUPS: { kind: Ref['kind']; title: string; glyph: string }[] = [
  { kind: 'branch', title: 'Branches', glyph: '' },
  { kind: 'remote', title: 'Remote branches', glyph: '' },
  { kind: 'tag', title: 'Tags', glyph: '' },
  { kind: 'stash', title: 'Stashes', glyph: '' },
]

const selectAll = (state: GraphState) => state.all

// Hidden until hover or focus so the list reads as names; keyboard users still tab onto them.
function StashActions({ name, sha }: { name: string; sha: string }) {
  const { run } = useGit()
  const commit = useCommitActions()
  return (
    <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
      <IconTool label={`Show the changes in ${name}`} tip="Show changes" onClick={() => commit.showChanges(sha)}>
        <FileDiff />
      </IconTool>
      <IconTool
        label={`Apply ${name}`}
        onClick={() => void run('stash-apply', { name, pop: false }, `Applied ${name}`)}>
        <ArchiveRestore />
      </IconTool>
      <IconTool label={`Pop ${name}`} onClick={() => void run('stash-apply', { name, pop: true }, `Popped ${name}`)}>
        <PackageOpen />
      </IconTool>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`Drop ${name}`}>
            <Trash2 />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-72 flex-col gap-2">
          <p>Drop {name}? Its changes are gone after this.</p>
          <Button
            size="sm"
            variant="destructive"
            className="self-end"
            onClick={() => void run('stash-drop', { name }, `Dropped ${name}`)}>
            Drop stash
          </Button>
        </PopoverContent>
      </Popover>
    </span>
  )
}

function BranchActions({ name, local }: { name: string; local: boolean }) {
  const { status, run } = useGit()
  const current = status?.branch
  return (
    <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
      {local ? (
        <IconTool
          label={`Switch to ${name}`}
          onClick={() => void run('switch', { branch: name, create: false }, `Switched to ${name}`)}>
          <ArrowRightLeft />
        </IconTool>
      ) : null}
      {current ? (
        <IconTool
          label={`Merge ${name} into ${current}`}
          onClick={() => void run('merge', { ref: name }, `Merged ${name} into ${current}`)}>
          <GitMerge />
        </IconTool>
      ) : null}
      {local ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`Delete ${name}`}>
              <Trash2 />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-72 flex-col gap-2">
            <p>Delete the branch {name}? Its commits stay reachable only if another branch has them.</p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void run('branch-delete', { name, force: false }, `Deleted ${name}`)}>
                Delete if merged
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void run('branch-delete', { name, force: true }, `Deleted ${name}`)}>
                Force delete
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  )
}

export function GraphSidebar() {
  const { graph, graphSelection } = useApp()
  const { refs } = useRefs()
  const all = useStore(graph, selectAll)
  const allId = useId()
  const [branchFrom, setBranchFrom] = useState<string | null>(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NewBranchDialog sha={branchFrom} onClose={() => setBranchFrom(null)} />
      <div className="flex items-center justify-between gap-2 border-border border-b p-3">
        <Label htmlFor={allId}>Every branch</Label>
        <Switch
          id={allId}
          className="border-muted-foreground"
          checked={all}
          onCheckedChange={(checked) => graph.setAll(Boolean(checked))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {GROUPS.map(({ kind, title, glyph }) => {
          const list = refs.filter((ref) => ref.kind === kind)
          if (list.length === 0) return null
          return (
            <section key={kind} aria-label={title} className="mb-3">
              <h3 className="px-2 pb-1 text-tn-comment">{title}</h3>
              {list.map((ref) => (
                <RefMenu key={ref.name} refEntry={ref} onNewBranch={setBranchFrom}>
                  <div className="group flex items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-w-0 flex-1 justify-start gap-2"
                      title={ref.subject ?? ref.name}
                      onClick={() => graphSelection.set(ref.sha)}>
                      <span className={`w-5 shrink-0 text-center ${ref.current ? 'text-tn-green' : 'text-tn-blue'}`}>
                        {glyph}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-start">
                        {kind === 'stash' ? (ref.subject ?? ref.name) : ref.name}
                      </span>
                      {ref.current ? <span className="text-tn-green">current</span> : null}
                    </Button>
                    {kind === 'stash' ? <StashActions name={ref.name} sha={ref.sha} /> : null}
                    {(kind === 'branch' || kind === 'remote') && !ref.current ? (
                      <BranchActions name={ref.name} local={kind === 'branch'} />
                    ) : null}
                  </div>
                </RefMenu>
              ))}
            </section>
          )
        })}
        <Remotes />
      </div>
    </div>
  )
}
