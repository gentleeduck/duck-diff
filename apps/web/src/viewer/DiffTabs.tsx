import type { DiffTarget } from '@duck-diff/protocol'
import { FileDiff, GitCommitHorizontal, GitCompareArrows, GitPullRequest, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { prefetchCommit } from '../graph/commit-details'
import type { GraphState } from '../graph/store'
import { useTarget } from '../hooks/useTarget'
import { useStore } from '../lib/store'
import { type DiffTab, ROOT, type TabsState } from '../state/tabs'

const selectTabs = (state: TabsState) => state
const selectEntries = (state: GraphState) => state.entries

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

// One tab per open comparison, like an editor's: the working tree first and fixed, the rest closable
// and dragged into any order.
export function DiffTabs() {
  const { api, tabs, graph, session } = useApp()
  const { navigate } = useTarget()
  const { tabs: list, active } = useStore(tabs, selectTabs)
  const entries = useStore(graph, selectEntries)
  const [dragging, setDragging] = useState<string | null>(null)

  // Subjects come from the graph when it is loaded, otherwise from the commit itself, read once.
  const [read, setRead] = useState<Record<string, string>>({})
  useEffect(() => {
    for (const tab of list) {
      const target = tab.target
      if (target.kind !== 'commit' || read[target.sha]) continue
      if (entries.some((entry) => entry.sha.startsWith(target.sha))) continue
      prefetchCommit(api, target.sha).then(
        (details) => setRead((now) => ({ ...now, [target.sha]: details.message.split('\n')[0] ?? '' })),
        () => {},
      )
    }
  }, [api, list, entries, read])
  const subjectOf = (target: DiffTarget) =>
    target.kind === 'commit'
      ? (entries.find((entry) => entry.sha.startsWith(target.sha))?.subject ?? read[target.sha])
      : undefined
  const close = (tab: DiffTab) => {
    const next = tabs.close(tab.id)
    if (next) navigate(next.target, true)
  }

  return (
    <div
      role="tablist"
      aria-label="Open diffs"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-border border-b bg-card [scrollbar-width:thin]">
      {list.map((tab) => {
        const selected = tab.id === active
        const label = tabLabel(tab.target, subjectOf(tab.target))
        const root = tab.id === ROOT
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            title={label}
            draggable={!root}
            onDragStart={(event) => {
              setDragging(tab.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => {
              if (!dragging || dragging === tab.id || root) return
              event.preventDefault()
              tabs.move(dragging, tab.id)
            }}
            onDragEnd={() => setDragging(null)}
            onPointerEnter={() => !selected && session.prefetch(tab.target)}
            onClick={() => !selected && navigate(tab.target)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') navigate(tab.target)
            }}
            // The middle button closes a tab, as in a browser.
            onAuxClick={(event) => {
              if (event.button === 1 && !root) close(tab)
            }}
            className={`group flex max-w-72 shrink-0 cursor-pointer items-center gap-1.5 border-border border-e ps-3 ${
              root ? 'pe-3' : 'pe-1'
            } ${
              selected
                ? 'bg-background text-foreground shadow-[inset_0_2px_0_var(--tn-blue)]'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            } ${dragging === tab.id ? 'opacity-50' : ''}`}>
            <TabIcon target={tab.target} />
            <span className="min-w-0 truncate">{label}</span>
            {root ? null : (
              <button
                type="button"
                aria-label={`Close ${label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  close(tab)
                }}
                className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-accent ${
                  selected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`}>
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
