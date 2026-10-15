import {
  Badge,
  HoverCardTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { GitBranch, Tag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useRowHeight } from '../app/useSizes'
import { useStore } from '../lib/store'
import { avatarFor, useAvatars } from './avatars'
import { CommitHover, CommitMenu } from './CommitMenu'
import { CommitPanel } from './CommitPanel'
import { matchesCommit } from './FindCommit'
import { GraphLines, LANE_WIDTH, laneColor } from './GraphLines'
import type { GraphRow } from './layout'
import { NewBranchDialog } from './NewBranchDialog'
import type { RefLabel } from './records'
import type { GraphState } from './store'

const ROW = 28
// Very wide histories clip at this many lanes so the subject column always stays readable.
const MAX_LANES = 10
const selectGraph = (state: GraphState) => state

// Each row is as wide as the lanes it draws, as an editor's graph does, so the subject starts right after them.
function rowLanes(row: GraphRow): number {
  let lanes = row.lane + 1
  for (const segment of row.segments) lanes = Math.max(lanes, segment.from[0] + 1, segment.to[0] + 1)
  return Math.min(MAX_LANES, lanes)
}
const selectQuery = (query: string) => query

const SHOWN_REFS = 2

function RefBadge({ refLabel, color }: { refLabel: RefLabel; color: string }) {
  const Icon = refLabel.kind === 'tag' ? Tag : GitBranch
  const tint = refLabel.kind === 'tag' ? 'var(--tn-yellow)' : color
  // The checked-out branch is a solid pill; every other ref is outlined.
  return (
    <Badge
      variant="outline"
      size="sm"
      className={`max-w-48 shrink-0 ${refLabel.current ? 'border-transparent' : ''}`}
      style={refLabel.current ? { background: tint, color: 'var(--background)' } : { color: tint }}>
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
  const avatars = useAvatars()
  const [branchFrom, setBranchFrom] = useState<string | null>(null)
  const selected = useStore(graphSelection, (sha: string | null) => sha)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (graph.get().status === 'idle') void graph.load()
  }, [graph])

  const index = useMemo(() => new Map(state.entries.map((entry, i) => [entry.sha, i])), [state.entries])

  const ROW_HEIGHT = useRowHeight(ROW)
  const virtualizer = useVirtualizer({
    count: state.entries.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })
  // A new interface size changes every row's height at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height is the trigger
  useEffect(() => virtualizer.measure(), [virtualizer, ROW_HEIGHT])
  const items = virtualizer.getVirtualItems()

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
    <>
      <NewBranchDialog sha={branchFrom} onClose={() => setBranchFrom(null)} />
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel minSize="40%">
          <div
            ref={scroller}
            role="listbox"
            aria-label="Commits"
            className="@container h-full overflow-auto"
            data-graph>
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {items.map((virtual) => {
                const entry = state.entries[virtual.index]
                const row = state.rows[virtual.index]
                if (!entry || !row) return null
                const isSelected = entry.sha === selected
                return (
                  <CommitHover key={entry.sha} entry={entry} avatar={avatarFor(avatars, entry.email)}>
                    <CommitMenu entry={entry} onNewBranch={setBranchFrom}>
                      <HoverCardTrigger asChild>
                        <div
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          onClick={() => graphSelection.set(entry.sha)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') graphSelection.set(entry.sha)
                          }}
                          className="absolute inset-x-0 flex cursor-pointer items-center gap-2 pe-2 hover:bg-accent/60 aria-selected:bg-accent"
                          style={{ height: ROW_HEIGHT, transform: `translateY(${virtual.start}px)` }}>
                          <span
                            className="shrink-0 overflow-hidden ps-2"
                            style={{ width: rowLanes(row) * LANE_WIDTH + 8 }}>
                            <GraphLines
                              row={row}
                              lanes={rowLanes(row)}
                              height={ROW_HEIGHT}
                              merge={entry.parents.length > 1}
                              head={entry.refs.some((ref) => ref.current)}
                            />
                          </span>
                          {/* Subject then author, as an editor's graph reads; refs sit at the end of the row. */}
                          <span
                            className={`min-w-0 truncate ${needle && matchesCommit(entry, needle) ? 'text-tn-yellow' : 'text-foreground'}`}>
                            {entry.subject}
                          </span>
                          <span className="min-w-0 max-w-48 shrink-[2] truncate text-muted-foreground">
                            {entry.author}
                          </span>
                          <span className="ms-auto flex shrink-0 items-center gap-1 ps-2">
                            <RefBadges refs={entry.refs} color={laneColor(row.color) ?? ''} />
                          </span>
                        </div>
                      </HoverCardTrigger>
                    </CommitMenu>
                  </CommitHover>
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
    </>
  )
}
