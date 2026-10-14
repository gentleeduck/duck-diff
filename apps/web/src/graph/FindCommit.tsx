import { Button, Input } from '@duck-diff/ui'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { GraphState } from './store'

const selectEntries = (state: GraphState) => state.entries

// Searches subjects, authors, emails and shas; Enter and the arrows step through matches by selecting them.
export function FindCommit() {
  const { graph, graphSelection } = useApp()
  const entries = useStore(graph, selectEntries)
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return entries
      .filter(
        (entry) =>
          entry.subject.toLowerCase().includes(needle) ||
          entry.author.toLowerCase().includes(needle) ||
          entry.email.toLowerCase().includes(needle) ||
          entry.sha.startsWith(needle),
      )
      .map((entry) => entry.sha)
  }, [entries, query])

  const go = (index: number) => {
    if (matches.length === 0) return
    const next = (index + matches.length) % matches.length
    setAt(next)
    graphSelection.set(matches[next] ?? null)
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label="Find commit"
        placeholder="Find commit"
        className="w-56"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setAt(0)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          // The first Enter lands on the current match; later ones move on.
          const onMatch = graphSelection.get() === matches[at]
          go(event.shiftKey ? at - 1 : onMatch ? at + 1 : at)
        }}
      />
      {query.trim() ? (
        <>
          <span className="w-20 shrink-0 text-center text-muted-foreground tabular-nums">
            {matches.length ? `${at + 1} of ${matches.length}` : 'none'}
          </span>
          <Button size="icon" variant="ghost" aria-label="Previous match" onClick={() => go(at - 1)}>
            <ChevronUp />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Next match" onClick={() => go(at + 1)}>
            <ChevronDown />
          </Button>
        </>
      ) : null}
    </div>
  )
}
