import {
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
import { useState } from 'react'
import type { RefList } from '../hooks/useRefs'
import type { Endpoint } from './model'

interface RefPickerProps {
  label: string
  side: 'from' | 'to'
  refs: RefList
  onPick(endpoint: Endpoint): void
}

const HEADINGS = { branch: 'Branches', tag: 'Tags', remote: 'Remote branches', stash: 'Stashes' }

export function RefPicker({ label, side, refs, onPick }: RefPickerProps) {
  const [open, setOpen] = useState(false)
  const pick = (endpoint: Endpoint) => {
    setOpen(false)
    onPick(endpoint)
  }
  const byKind = (kind: string) => refs.refs.filter((ref) => ref.kind === kind)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={side === 'from' ? `Compare from ${label}` : `Compare to ${label}`}
          className="rounded-sm px-1 underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Branch, tag or commit" />
          <CommandList className="max-h-80">
            <CommandEmpty>No ref matches.</CommandEmpty>
            <CommandGroup heading="Your changes">
              {side === 'to' && <CommandItem onSelect={() => pick({ kind: 'worktree' })}>Working tree</CommandItem>}
              <CommandItem onSelect={() => pick({ kind: 'index' })}>Staged</CommandItem>
              {side === 'from' && <CommandItem onSelect={() => pick({ kind: 'ref', name: 'HEAD' })}>HEAD</CommandItem>}
            </CommandGroup>
            {(['branch', 'tag', 'remote', 'stash'] as const).map((kind) =>
              byKind(kind).length > 0 ? (
                <CommandGroup key={kind} heading={HEADINGS[kind]}>
                  {byKind(kind).map((ref) => (
                    <CommandItem
                      key={ref.name}
                      value={`${ref.name} ${ref.subject ?? ''}`}
                      onSelect={() => pick({ kind: 'ref', name: ref.name })}>
                      <span className="font-mono">{ref.name}</span>
                      {ref.subject && <span className="truncate text-muted-foreground">{ref.subject}</span>}
                      {ref.current && <span className="ml-auto text-muted-foreground text-[12px]">current</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null,
            )}
            {refs.commits.length > 0 && (
              <CommandGroup heading="Recent commits">
                {refs.commits.map((commit) => (
                  <CommandItem
                    key={commit.sha}
                    value={`${commit.sha} ${commit.subject}`}
                    onSelect={() => pick({ kind: 'ref', name: commit.sha })}>
                    <span className="font-mono text-muted-foreground">{commit.sha.slice(0, 7)}</span>
                    <span className="truncate">{commit.subject}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
