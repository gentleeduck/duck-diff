import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@duck-diff/ui'
import { GitBranch, Plus } from 'lucide-react'
import { useState } from 'react'
import { TextLine } from '../app/skeletons'
import { useRefs } from '../hooks/useRefs'
import { useGit } from './GitProvider'

// Switches to a local branch, checks out a remote one as a tracking branch, or creates a new one from HEAD.
export function BranchMenu() {
  const { status, busy, run } = useGit()
  const { refs } = useRefs()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const branches = refs.filter((ref) => ref.kind === 'branch')
  const remotes = refs.filter((ref) => ref.kind === 'remote')
  const name = query.trim()
  const exists = branches.some((ref) => ref.name === name)

  const choose = async (branch: string, create: boolean) => {
    setOpen(false)
    setQuery('')
    await run('switch', { branch, create }, create ? `Created and switched to ${branch}` : `Switched to ${branch}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Branch" loading={busy === 'switch'} className="justify-start">
          <GitBranch />
          <span className="min-w-0 max-w-28 truncate pe-0.5 @6xl/top:max-w-56">
            {status ? (status.branch ?? 'detached HEAD') : <TextLine className="w-20" />}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <Command>
          <CommandInput
            placeholder="Switch to or create a branch"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
          <CommandList className="max-h-96">
            <CommandEmpty>No branch matches.</CommandEmpty>
            {name && !exists ? (
              <CommandGroup heading="New branch">
                {/* The item caches its text on mount for filtering, so it remounts as the name changes. */}
                <CommandItem key={name} value={`create ${name}`} onSelect={() => void choose(name, true)}>
                  <Plus />
                  Create {name} from {status?.branch ?? 'HEAD'}
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Branches">
              {branches.map((ref) => (
                <CommandItem key={ref.name} value={ref.name} onSelect={() => void choose(ref.name, false)}>
                  <GitBranch className={ref.current ? 'text-tn-green' : 'text-tn-blue'} />
                  <span className="min-w-0 flex-1 truncate">{ref.name}</span>
                  {ref.current ? <span className="text-tn-green">current</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {remotes.length ? (
              <CommandGroup heading="Remote branches">
                {remotes.map((ref) => {
                  const local = ref.name.slice(ref.name.indexOf('/') + 1)
                  return (
                    <CommandItem key={ref.name} value={ref.name} onSelect={() => void choose(local, false)}>
                      <GitBranch className="text-tn-comment" />
                      <span className="min-w-0 flex-1 truncate">{ref.name}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
