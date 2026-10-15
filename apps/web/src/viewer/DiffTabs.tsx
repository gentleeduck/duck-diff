import type { DiffTarget } from '@duck-diff/protocol'
import { FileDiff, GitCommitHorizontal, GitCompareArrows, GitPullRequest, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { prefetchCommit } from '../graph/commit-details'
import type { GraphState } from '../graph/store'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
import { type DiffTab, ROOT, type TabsState } from '../state/tabs'

const selectTabs = (state: TabsState) => state.tabs
const selectActive = (state: TabsState) => state.active

const short = (ref: string) => (/^[0-9a-f]{12,}$/.test(ref) ? ref.slice(0, 7) : ref)
const PULL = /^refs\/duck-diff\/pr\/(\d+)$/

export function tabLabel(target: DiffTarget, subject?: string): string {
  switch (target.kind) {
    case 'local':
      return 'Working tree'
    case 'staged':
      return 'Staged'
    case 'unstaged':
      return 'Unstaged'
    case 'commit': {
      const name = target.path ? ` ${target.path.split('/').pop()}` : ''
      return `${short(target.sha)}${name}${subject ? ` ${subject}` : ''}`
    }
    case 'range': {
      const pull = PULL.exec(target.to)
      if (pull) return `#${pull[1]}`
      return `${short(target.from)}${target.mode === 'merge-base' ? '...' : '..'}${short(target.to)}`
    }
  }
}

function TabIcon({ target }: { target: DiffTarget }) {
  if (target.kind === 'commit') return <GitCommitHorizontal className="size-4 shrink-0" />
  if (target.kind === 'range')
    return PULL.test(target.to) ? (
      <GitPullRequest className="size-4 shrink-0" />
    ) : (
      <GitCompareArrows className="size-4 shrink-0" />
    )
  return <FileDiff className="size-4 shrink-0" />
}

interface TabEvents {
  open(tab: DiffTab): void
  close(tab: DiffTab): void
  hover(tab: DiffTab): void
  drag(tab: DiffTab | null): void
  dragOver(tab: DiffTab): void
}

// Props are plain values and one stable set of handlers, so a tab renders again only when it changes.
const Tab = memo(function Tab({
  tab,
  label,
  selected,
  dragging,
  on,
}: {
  tab: DiffTab
  label: string
  selected: boolean
  dragging: boolean
  on: TabEvents
}) {
  const root = tab.id === ROOT
  return (
    <div
      role="tab"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      title={label}
      draggable={!root}
      onDragStart={(event) => {
        on.drag(tab)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(event) => {
        if (root) return
        event.preventDefault()
        on.dragOver(tab)
      }}
      onDragEnd={() => on.drag(null)}
      onPointerEnter={() => !selected && on.hover(tab)}
      onClick={() => !selected && on.open(tab)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') on.open(tab)
      }}
      // The middle button closes a tab, as in a browser.
      onAuxClick={(event) => {
        if (event.button === 1 && !root) on.close(tab)
      }}
      className={`group flex max-w-72 shrink-0 cursor-pointer items-center gap-1.5 border-border border-e ps-3 ${
        root ? 'pe-3' : 'pe-1'
      } ${
        selected
          ? 'bg-background text-foreground shadow-[inset_0_2px_0_var(--tn-blue)]'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      } ${dragging ? 'opacity-50' : ''}`}>
      <TabIcon target={tab.target} />
      <span className="min-w-0 truncate pe-0.5">{label}</span>
      {root ? null : (
        <button
          type="button"
          aria-label={`Close ${label}`}
          onClick={(event) => {
            event.stopPropagation()
            on.close(tab)
          }}
          className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-accent ${
            selected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
})

// One tab per open comparison, like an editor's: the working tree first and fixed, the rest closable
// and dragged into any order.
export function DiffTabs() {
  const { api, tabs, graph, session } = useApp()
  const { navigate } = useTarget()
  const list = useStore(tabs, selectTabs)
  const active = useStore(tabs, selectActive)
  const [dragging, setDragging] = useState<string | null>(null)

  // Only the subjects of open commit tabs are read from the graph, so a graph load that changes none of
  // them leaves the bar alone. They come back joined, which compares by value.
  const shas = list.flatMap((tab) => (tab.target.kind === 'commit' ? [tab.target.sha] : []))
  const shaKey = shas.join(' ')
  const selectSubjects = useCallback(
    (state: GraphState) =>
      shaKey
        .split(' ')
        .map((sha) => (sha ? (state.entries.find((entry) => entry.sha.startsWith(sha))?.subject ?? '') : ''))
        .join('\n'),
    [shaKey],
  )
  const fromGraph = useStore(graph, selectSubjects).split('\n')
  const [read, setRead] = useState<Record<string, string>>({})
  const subjects: Record<string, string> = {}
  shas.forEach((sha, at) => {
    subjects[sha] = fromGraph[at] || read[sha] || ''
  })

  // Commits the graph has not loaded are read once each.
  useEffect(() => {
    for (const sha of shaKey.split(' ')) {
      if (!sha || read[sha] !== undefined) continue
      prefetchCommit(api, sha).then(
        (details) => setRead((now) => ({ ...now, [sha]: details.message.split('\n')[0] ?? '' })),
        () => {},
      )
    }
  }, [api, shaKey, read])

  const state = useRef({ navigate, dragging })
  state.current = { navigate, dragging }
  const [on] = useState<TabEvents>(() => ({
    open: (tab) => state.current.navigate(tab.target),
    close: (tab) => {
      const next = tabs.close(tab.id)
      if (next) state.current.navigate(next.target, true)
    },
    hover: (tab) => session.prefetch(tab.target),
    drag: (tab) => setDragging(tab?.id ?? null),
    dragOver: (tab) => {
      const moving = state.current.dragging
      if (moving && moving !== tab.id) tabs.move(moving, tab.id)
    },
  }))

  return (
    <div
      role="tablist"
      aria-label="Open diffs"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-border border-b bg-card [scrollbar-width:thin]">
      {list.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          label={tabLabel(tab.target, tab.target.kind === 'commit' ? subjects[tab.target.sha] : undefined)}
          selected={tab.id === active}
          dragging={dragging === tab.id}
          on={on}
        />
      ))}
    </div>
  )
}
