import type { Commit, DiffTarget, ResolvedRevision } from '@duck-diff/protocol'
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
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, GitBranch } from 'lucide-react'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import type { RefList } from '../hooks/useRefs'
import { useSettled } from '../hooks/useSettled'
import type { Endpoint } from './model'

interface RefPickerProps {
  label: string
  // The ref this side shows, which the box opens with to be edited in place; empty for the working tree.
  value?: string
  side: 'from' | 'to'
  refs: RefList
  onPick(endpoint: Endpoint): void
  // A typed range (a..b, a...b) sets both sides at once.
  onRange?(target: DiffTarget): void
}

const HEADINGS = { branch: 'Branches', tag: 'Tags', remote: 'Remote branches', stash: 'Stashes' }
const NO_COMMITS: Commit[] = []

function CommitLine({ commit }: { commit: Pick<Commit, 'sha' | 'subject'> }) {
  return (
    <>
      <span className="font-mono text-muted-foreground">{commit.sha.slice(0, 7)}</span>
      <span className="truncate">{commit.subject}</span>
    </>
  )
}

// What git read the typed text as: the commit (and how a form like ^abc was taken), or both ends of a range.
function Reading({ reading }: { reading: Exclude<ResolvedRevision, { kind: 'unknown' }> }) {
  if (reading.kind === 'range')
    return (
      <span className="flex min-w-0 items-center gap-1 font-mono text-muted-foreground">
        {reading.from.sha.slice(0, 7)}
        <span>{reading.mode === 'merge-base' ? '...' : '..'}</span>
        {reading.to.sha.slice(0, 7)}
      </span>
    )
  return (
    <>
      {reading.note ? <span className="shrink-0 text-tn-comment">{reading.note}</span> : null}
      <CommitLine commit={reading} />
    </>
  )
}

// Any revision git reads can be typed (a hash, abc^, ^abc, HEAD~3, v1.2, :/a message, main@{yesterday}, a..b)
// and git says what it is as you type. The same text narrows the branches, tags and recent commits, and finds
// older commits by their message.
export function RefPicker({ label, value = '', side, refs, onPick, onRange }: RefPickerProps) {
  const { api, queryClient } = useApp()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Opening shows everything; the list narrows once the text is changed.
  const [edited, setEdited] = useState(false)
  // Enter applies the text unless the arrows went down into the list to choose a row there.
  const [navigated, setNavigated] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const text = query.trim()
  const settled = useSettled(text, 150)
  const resolve = (rev: string) => ({
    queryKey: ['ref-picker', 'resolve', rev],
    queryFn: () =>
      api.resolve(rev).catch((error: Error): ResolvedRevision => ({ kind: 'unknown', reason: error.message })),
    staleTime: 10_000,
  })
  const resolved = useQuery({ ...resolve(settled), enabled: open && settled !== '' })
  const found = useQuery({
    queryKey: ['ref-picker', 'grep', settled],
    queryFn: () => api.commits({ head: 'HEAD', grep: settled, limit: 30 }).catch(() => NO_COMMITS),
    enabled: open && settled.length >= 2,
    staleTime: 10_000,
  })
  const checking = text !== settled || resolved.isFetching
  const reading = !checking && settled === text ? (resolved.data ?? null) : null

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const pick = (endpoint: Endpoint) => {
    close()
    onPick(endpoint)
  }
  // A range picks both sides where the bar takes one; a picker without onRange keeps the side it is for.
  const take = (found: ResolvedRevision) => {
    if (found.kind === 'commit') pick({ kind: 'ref', name: found.ref })
    else if (found.kind === 'range' && onRange) {
      close()
      onRange({ kind: 'range', from: found.from.ref, to: found.to.ref, mode: found.mode })
    }
  }
  const submit = () => {
    if (text) void queryClient.fetchQuery(resolve(text)).then(take)
  }
  const problem =
    reading?.kind === 'unknown'
      ? reading.reason
      : reading?.kind === 'range' && !onRange
        ? 'A range sets both sides; type one revision here'
        : null
  const needle = edited ? text.toLowerCase() : ''
  const matches = (...fields: (string | undefined)[]) =>
    !needle || fields.some((field) => field?.toLowerCase().includes(needle))
  const byKind = (kind: string) => refs.refs.filter((ref) => ref.kind === kind && matches(ref.name, ref.subject))
  const recent = refs.commits.filter((commit) => matches(commit.sha, commit.subject))
  const shown = new Set(recent.map((commit) => commit.sha))
  const older = (edited && settled === text ? (found.data ?? NO_COMMITS) : NO_COMMITS).filter(
    (commit) => !shown.has(commit.sha),
  )
  const changes = [
    side === 'to' ? { label: 'Working tree', endpoint: { kind: 'worktree' } as const } : null,
    { label: 'Staged', endpoint: { kind: 'index' } as const },
    side === 'from' ? { label: 'HEAD', endpoint: { kind: 'ref', name: 'HEAD' } as const } : null,
  ].filter((entry) => entry !== null && matches(entry.label))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setEdited(false)
        setNavigated(false)
        setQuery(next ? value : '')
        // The box selects its value as it takes focus (onFocus below); this only gives it focus when the popover
        // kept it for itself.
        if (next) requestAnimationFrame(() => document.activeElement !== input.current && input.current?.focus())
      }}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={side === 'from' ? `Compare from ${label}` : `Compare to ${label}`}
          title={label}
          className="min-w-9 max-w-44 shrink justify-start gap-1.5 px-2.5 @6xl/top:max-w-56">
          <GitBranch className="size-4 shrink-0" />
          {/* Italic glyphs lean past the box; the end padding keeps the last one from being clipped. */}
          <span className="min-w-0 truncate pe-0.5">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            ref={input}
            autoFocus
            value={query}
            aria-invalid={problem ? true : undefined}
            // Opened with the value selected, as an address bar is: typing replaces it, the arrows edit it.
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setQuery(event.target.value)
              setEdited(true)
              setNavigated(false)
            }}
            onKeyDown={(event) => {
              // Home and End move the caret, as in any text box; the list would take them to jump between rows.
              if (event.key === 'Home' || event.key === 'End') return event.stopPropagation()
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setNavigated(true)
              if (event.key !== 'Enter' || (navigated && list.current?.querySelector('[data-highlighted]'))) return
              // Enter takes the text, waiting for git's answer when it is still on its way.
              event.preventDefault()
              event.stopPropagation()
              submit()
            }}
            placeholder="Branch, tag, commit, or any revision: abc^, HEAD~2, a..b"
          />
          {text ? (
            <div data-ref-check className="flex min-h-7 items-center gap-2 px-2 pb-2">
              {checking ? (
                <p role="status" className="text-muted-foreground">
                  Checking {text}
                </p>
              ) : problem ? (
                <p role="alert" className="flex min-w-0 items-center gap-1.5 text-destructive">
                  <CircleAlert className="size-4 shrink-0" />
                  <span className="min-w-0 break-words">{problem}</span>
                </p>
              ) : reading && reading.kind !== 'unknown' ? (
                <>
                  <p role="status" className="flex min-w-0 flex-1 items-center gap-2">
                    <Reading reading={reading} />
                  </p>
                  <Button size="sm" onClick={submit}>
                    Use
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          <div ref={list}>
            <CommandList className="max-h-96">
              <CommandEmpty>No ref or commit matches.</CommandEmpty>
              {changes.length ? (
                <CommandGroup heading="Your changes">
                  {changes.map((entry) =>
                    entry ? (
                      <CommandItem
                        key={entry.label}
                        value={`change:${entry.label}`}
                        onSelect={() => pick(entry.endpoint)}>
                        {entry.label}
                      </CommandItem>
                    ) : null,
                  )}
                </CommandGroup>
              ) : null}
              {(['branch', 'tag', 'remote', 'stash'] as const).map((kind) =>
                byKind(kind).length > 0 ? (
                  <CommandGroup key={kind} heading={HEADINGS[kind]}>
                    {byKind(kind).map((ref) => (
                      <CommandItem
                        key={ref.name}
                        value={`ref:${ref.name}`}
                        onSelect={() => pick({ kind: 'ref', name: ref.name })}>
                        <span className="font-mono">{ref.name}</span>
                        {ref.subject && <span className="truncate text-muted-foreground">{ref.subject}</span>}
                        {ref.current && <span className="ml-auto text-muted-foreground">current</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null,
              )}
              {recent.length > 0 && (
                <CommandGroup heading="Recent commits">
                  {recent.map((commit) => (
                    <CommandItem
                      key={commit.sha}
                      value={`commit:${commit.sha}`}
                      onSelect={() => pick({ kind: 'ref', name: commit.sha })}>
                      <CommitLine commit={commit} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {older.length > 0 && (
                <CommandGroup heading={`Commits matching ${text}`}>
                  {older.map((commit) => (
                    <CommandItem
                      key={commit.sha}
                      value={`found:${commit.sha}`}
                      onSelect={() => pick({ kind: 'ref', name: commit.sha })}>
                      <CommitLine commit={commit} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
