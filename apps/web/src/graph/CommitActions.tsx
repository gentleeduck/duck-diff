import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Cherry, GitBranchPlus, GitCompareArrows, LocateFixed, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useGit } from '../git/GitProvider'
import { usableBranchName as usable, useCommitActions } from './commit-actions'

export function CommitActions({ sha }: { sha: string }) {
  const { busy } = useGit()
  const actions = useCommitActions()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const short = sha.slice(0, 7)

  const create = async () => {
    if (!usable(name)) return
    if (await actions.createBranch(name.trim(), sha)) {
      setOpen(false)
      setName('')
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        title="Everything that changed between this commit and HEAD"
        onClick={() => actions.compareWithHead(sha)}>
        <GitCompareArrows />
        Compare with HEAD
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <GitBranchPlus />
            New branch here
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}>
            <label className="text-muted-foreground" htmlFor={`branch-${sha}`}>
              New branch from {short}
            </label>
            <Input
              id={`branch-${sha}`}
              autoFocus
              placeholder="feat/name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={!usable(name)} loading={busy === 'switch'}>
              Create and switch
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'cherry-pick'}
        title="Apply this commit's change on top of the current branch"
        onClick={() => void actions.cherryPick(sha)}>
        <Cherry />
        Cherry-pick
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'revert'}
        title="Add a commit that undoes this one"
        onClick={() => void actions.revert(sha)}>
        <Undo2 />
        Revert
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'checkout'}
        title="Detached HEAD: look around without moving a branch"
        onClick={() => void actions.checkout(sha)}>
        <LocateFixed />
        Checkout
      </Button>
    </div>
  )
}
