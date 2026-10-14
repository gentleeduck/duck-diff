import {
  Badge,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { GitBranch, Tag } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { relativeTime } from '../sidebar/relative-time'
import { CommitPanel } from './CommitPanel'
import { matchesCommit } from './FindCommit'
import { GraphLines, LANE_WIDTH, laneColor } from './GraphLines'
import type { RefLabel } from './records'
import type { GraphState } from './store'

const ROW_HEIGHT = 28
// Very wide histories clip at this many lanes so the subject column always stays readable.
const MAX_LANES = 10
const selectGraph = (state: GraphState) => state
const selectQuery = (query: string) => query

const SHOWN_REFS = 2

function RefBadge({ refLabel, color }: { refLabel: RefLabel; color: string }) {
  const Icon = refLabel.kind === 'tag' ? Tag : GitBranch
  return (
    <Badge
      variant="outline"
      size="sm"
      className={`max-w-48 shrink-0 ${refLabel.current ? 'border-current bg-current/15' : 'opacity-80'}`}
      style={{ color: refLabel.kind === 'tag' ? 'var(--tn-yellow)' : color }}>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{refLabel.name}</span>
    </Badge>
  )
}

// The current branch first, then the rest; past two, a count keeps the subject readable.
function RefBadges({ refs, color }: { refs: RefLabel[]; color: string }) {
  if (refs.length === 0) return null
  const ordered = [...refs].sort((a, b) => Number(b.current) - Number(a.current))
  const shown = ordered.slice(0, SHOWN_REFS)
  const hidden = ordered.slice(SHOWN_REFS)
  return (
    <>
      {shown.map((ref) => (
        <RefBadge key={`${ref.kind}:${ref.name}`} refLabel={ref} color={color} />
      ))}
      {hidden.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" size="sm" className="shrink-0 text-muted-foreground">
              +{hidden.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{hidden.map((ref) => ref.name).join(', ')}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  )
}

export default function GraphView() {
  const { graph, graphSelection, graphQuery } = useApp()
  const state = useStore(graph, selectGraph)
  const needle = useStore(graphQuery, selectQuery).trim().toLowerCase()
  const selected = useStore(graphSelection, (sha: string | null) => sha)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (graph.get().status === 'idle') void graph.load()
  }, [graph])

  const index = useMemo(() => new Map(state.entries.map((entry, i) => [entry.sha, i])), [state.entries])

  const virtualizer = useVirtualizer({
    count: state.entries.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  // The column fits the lanes on screen, with a margin of rows either side so it does not jump on every scroll.
  const items = virtualizer.getVirtualItems()
  const from = Math.max(0, (items[0]?.index ?? 0) - 8)
  const to = (items.at(-1)?.index ?? 0) + 8
  let lanes = 1
  for (let i = from; i <= to && i < state.rows.length; i++) lanes = Math.max(lanes, state.rows[i]?.width ?? 1)
  lanes = Math.min(MAX_LANES, lanes)

  // Selecting a commit from elsewhere (a branch in the sidebar) brings its row into view.
  useEffect(() => {
    const at = selected ? index.get(selected) : undefined
    if (at !== undefined) virtualizer.scrollToIndex(at, { align: 'center' })
  }, [selected, index, virtualizer])

  if (state.status === 'error') return <p className="p-4 text-removed">Could not read the history: {state.error}</p>
  if (state.status !== 'idle' && state.entries.length === 0 && state.status === 'ready') {
    return <p className="p-4 text-muted-foreground">This repository has no commits yet.</p>
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel minSize="40%">
        <div ref={scroller} role="listbox" aria-label="Commits" className="@container h-full overflow-auto" data-graph>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((virtual) => {
              const entry = state.entries[virtual.index]
              const row = state.rows[virtual.index]
              if (!entry || !row) return null
              const isSelected = entry.sha === selected
              return (
                <div
                  key={entry.sha}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  onClick={() => graphSelection.set(entry.sha)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') graphSelection.set(entry.sha)
                  }}
                  className="absolute inset-x-0 flex cursor-pointer items-center gap-3 pe-3 hover:bg-accent/60 aria-selected:bg-accent"
                  style={{ height: ROW_HEIGHT, transform: `translateY(${virtual.start}px)` }}>
                  <span className="shrink-0 overflow-hidden ps-2" style={{ width: lanes * LANE_WIDTH + 8 }}>
                    <GraphLines row={row} lanes={lanes} height={ROW_HEIGHT} merge={entry.parents.length > 1} />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    <RefBadges refs={entry.refs} color={laneColor(row.color) ?? ''} />
                    <span
                      className={`min-w-0 truncate ${needle && matchesCommit(entry, needle) ? 'text-tn-yellow' : ''}`}>
                      {entry.subject}
                    </span>
                  </span>
                  {/* Side columns drop out as the pane narrows, so the subject always keeps room. */}
                  <span className="hidden w-36 shrink-0 truncate text-muted-foreground @3xl:block">{entry.author}</span>
                  <span className="hidden w-28 shrink-0 truncate text-end text-muted-foreground @xl:block">
                    {relativeTime(entry.time)}
                  </span>
                  <span className="w-20 shrink-0 text-end text-tn-comment">{entry.sha.slice(0, 7)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </ResizablePanel>
      {selected ? (
        <>
          <ResizableHandle withHandle={false} />
          <ResizablePanel defaultSize="34%" minSize="22%" maxSize="55%">
            <CommitPanel sha={selected} onClose={() => graphSelection.set(null)} />
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  )
}
