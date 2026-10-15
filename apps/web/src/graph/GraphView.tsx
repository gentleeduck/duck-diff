import {
  Badge,
  Button,
  HoverCardTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@duck-diff/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Cherry, GitBranch, Tag } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { GraphSkeleton } from '../app/skeletons'
import { useRowHeight } from '../app/useSizes'
import { rememberedTop, useScrollMemory } from '../hooks/useScrollMemory'
import { useStore } from '../lib/store'
import { avatarFor, useAvatars } from './avatars'
import { BisectBanner } from './BisectBanner'
import { CommitHover, CommitMenu } from './CommitMenu'
import { CommitPanel } from './CommitPanel'
import { useCommitActions } from './commit-actions'
import { matchesCommit } from './FindCommit'
import { GraphLines, LANE_WIDTH, laneColor } from './GraphLines'
import type { GraphRow } from './layout'
import { NewBranchDialog } from './NewBranchDialog'
import { RebaseDialog } from './RebaseDialog'
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
  const { graph, graphSelection, graphQuery, queries, queryClient } = useApp()
  const state = useStore(graph, selectGraph)
  const needle = useStore(graphQuery, selectQuery).trim().toLowerCase()
  const avatars = useAvatars()
  const [branchFrom, setBranchFrom] = useState<string | null>(null)
  const [rebaseOnto, setRebaseOnto] = useState<string | null>(null)
  // Shift-click picks every commit between the selected one and the clicked one, for picking them over.
  const [picked, setPicked] = useState<string[]>([])
  const actions = useCommitActions()
  const selected = useStore(graphSelection, (sha: string | null) => sha)
  const scroller = useRef<HTMLDivElement>(null)
  useScrollMemory(scroller, 'graph')

  useEffect(() => {
    if (graph.get().status === 'idle') void graph.load()
  }, [graph])

  const index = useMemo(() => new Map(state.entries.map((entry, i) => [entry.sha, i])), [state.entries])

  const ROW_HEIGHT = useRowHeight(ROW)
  const virtualizer = useVirtualizer({
    count: state.entries.length,
    initialOffset: () => rememberedTop('graph'),
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })
  // A new interface size changes every row's height at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height is the trigger
  useEffect(() => virtualizer.measure(), [virtualizer, ROW_HEIGHT])
  const items = virtualizer.getVirtualItems()

  // The commit at the top of the view stays there when the list changes under it, as it does when
  // every branch is shown or hidden and other commits slot in above.
  const anchor = useRef<{ sha: string; offset: number } | null>(null)
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const remember = () => {
      const index = Math.floor(element.scrollTop / ROW_HEIGHT)
      const entry = graph.get().entries[index]
      anchor.current = entry ? { sha: entry.sha, offset: element.scrollTop - index * ROW_HEIGHT } : null
    }
    remember()
    element.addEventListener('scroll', remember, { passive: true })
    return () => element.removeEventListener('scroll', remember)
  }, [graph, ROW_HEIGHT])
  useLayoutEffect(() => {
    const element = scroller.current
    const held = anchor.current
    if (!element || !held || element.scrollTop === 0) return
    const at = index.get(held.sha)
    if (at === undefined) return
    const top = at * ROW_HEIGHT + held.offset
    if (Math.abs(element.scrollTop - top) > 1) element.scrollTop = top
  }, [index, ROW_HEIGHT])

  // Selecting a commit from elsewhere (a branch in the sidebar) brings its row into view.
  // Only a new selection scrolls; the list changing (every branch on or off, a refresh) leaves the view be.
  const pending = useRef<string | null>(null)
  useEffect(() => {
    pending.current = selected
  }, [selected])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new selection is the trigger even when the list is the same
  useEffect(() => {
    const want = pending.current
    const at = want ? index.get(want) : undefined
    if (at === undefined) return
    pending.current = null
    virtualizer.scrollToIndex(at, { align: 'center' })
  }, [selected, index, virtualizer])

  if (state.status === 'error') return <p className="p-4 text-removed">Could not read the history: {state.error}</p>
  if (state.status !== 'idle' && state.entries.length === 0 && state.status === 'ready') {
    return <p className="p-4 text-muted-foreground">No commits yet. git commit -m "quack" and we are in business.</p>
  }
  if (state.entries.length === 0) return <GraphSkeleton />

  return (
    <>
      <NewBranchDialog sha={branchFrom} onClose={() => setBranchFrom(null)} />
      <RebaseDialog base={rebaseOnto} onClose={() => setRebaseOnto(null)} />
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel minSize="40%" className="flex flex-col">
          <BisectBanner />
          {picked.length > 1 ? (
            <div
              role="toolbar"
              aria-label="Selected commits"
              className="flex items-center gap-2 border-border border-b bg-accent/40 px-3 py-1.5">
              <span className="me-auto">{picked.length} commits selected</span>
              <Button
                size="sm"
                onClick={() => {
                  // The graph lists newest first; git picks them in the order they were made.
                  void actions.cherryPickRange([...picked].reverse()).then((ok) => ok && setPicked([]))
                }}>
                <Cherry />
                Cherry-pick {picked.length} commits
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
                Clear
              </Button>
            </div>
          ) : null}
          <div
            ref={scroller}
            role="listbox"
            aria-label="Commits"
            className="@container min-h-0 flex-1 overflow-auto"
            data-graph>
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {items.map((virtual) => {
                const entry = state.entries[virtual.index]
                const row = state.rows[virtual.index]
                if (!entry || !row) return null
                const isSelected = entry.sha === selected || picked.includes(entry.sha)
                return (
                  <CommitHover key={entry.sha} entry={entry} avatar={avatarFor(avatars, entry.email)}>
                    <CommitMenu entry={entry} onNewBranch={setBranchFrom} onRebase={setRebaseOnto}>
                      <HoverCardTrigger asChild>
                        <div
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          // The hover card's details start loading as the pointer arrives, ahead of its delay.
                          onPointerEnter={() => {
                            void queryClient.prefetchQuery(queries.git.commit(entry.sha))
                            void queryClient.prefetchQuery(queries.git.commitStat(entry.sha))
                          }}
                          onClick={(event) => {
                            const from = selected ? index.get(selected) : undefined
                            if (event.shiftKey && from !== undefined) {
                              const [low, high] = from < virtual.index ? [from, virtual.index] : [virtual.index, from]
                              setPicked(state.entries.slice(low, high + 1).map((each) => each.sha))
                              return
                            }
                            setPicked([])
                            graphSelection.set(entry.sha)
                          }}
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
