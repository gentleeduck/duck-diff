import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { Cherry, GitBranchPlus, GitCompareArrows, LocateFixed, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useGit } from '../git/GitProvider'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'

// Branch names git would reject are caught by the server; this only blocks the obvious blanks.
const usable = (name: string) => name.trim().length > 0 && !/\s/.test(name.trim())

export function CommitActions({ sha }: { sha: string }) {
  const { busy, run } = useGit()
  const { navigate } = useTarget()
  const { show } = useView()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const short = sha.slice(0, 7)

  const create = async () => {
    if (!usable(name)) return
    if (await run('switch', { branch: name.trim(), create: true, start: sha }, `Created ${name.trim()} at ${short}`)) {
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
        onClick={() => {
          navigate({ kind: 'range', from: sha, to: 'HEAD', mode: 'two-dot' })
          show('changes')
        }}>
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
        onClick={() => void run('cherry-pick', { ref: sha }, `Cherry-picked ${short}`)}>
        <Cherry />
        Cherry-pick
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'revert'}
        title="Add a commit that undoes this one"
        onClick={() => void run('revert', { ref: sha }, `Reverted ${short}`)}>
        <Undo2 />
        Revert
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'checkout'}
        title="Detached HEAD: look around without moving a branch"
        onClick={() => void run('checkout', { sha }, `Checked out ${short}`)}>
        <LocateFixed />
        Checkout
      </Button>
    </div>
  )
}
