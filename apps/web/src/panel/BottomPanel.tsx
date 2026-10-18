import { Badge, Button, ResizableHandle, ResizablePanel, type ResizablePanelHandle } from '@duck-diff/ui'
import { GitMerge, Plus, ScrollText, SquareTerminal, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useGit } from '../git/GitProvider'
import { useStore } from '../lib/store'
import { MergePanel } from '../merge/MergePanel'
import { selectConflicts } from '../merge/merge-model'
import { useStage } from '../state/stage'
import { TerminalPane } from '../terminal/TerminalPane'
import type { TerminalTabsState } from '../terminal/tabs'
import { OutputView } from './OutputView'
import type { PanelState } from './panel'

const selectOpen = (state: PanelState) => state.open
const selectTab = (state: PanelState) => state.tab
const selectHeight = (state: PanelState) => state.height
const selectTabs = (state: TerminalTabsState) => state.tabs
const selectLoaded = (state: TerminalTabsState) => state.loaded
const MIN_HEIGHT = 120

function PanelTab({
  selected,
  label,
  name = label,
  icon,
  count,
  onSelect,
  onClose,
}: {
  selected: boolean
  label: string
  // The fixed name, when the label is the shell title.
  name?: string
  icon: ReactNode
  // Files waiting on the user, for the Merge tab.
  count?: number
  onSelect(): void
  onClose?(): void
}) {
  return (
    <div
      role="tab"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-label={name}
      title={label}
      onClick={onSelect}
      onKeyDown={(event) => event.key === 'Enter' && onSelect()}
      onAuxClick={(event) => event.button === 1 && onClose?.()}
      className={`group flex max-w-60 shrink-0 cursor-pointer items-center gap-1.5 border-border border-e ps-3 ${
        onClose ? 'pe-1' : 'pe-3'
      } ${
        selected
          ? 'bg-background text-foreground shadow-[inset_0_2px_0_var(--tn-blue)]'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      }`}>
      {icon}
      <span className="min-w-0 truncate pe-0.5">{label}</span>
      {count ? (
        <Badge variant="soft-warning" size="sm" className="shrink-0 tabular-nums">
          {count}
        </Badge>
      ) : null}
      {onClose ? (
        <Button
          variant="nothing"
          size="none"
          type="button"
          aria-label={`Close ${name}`}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-accent ${
            selected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          } whitespace-normal`}>
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

export function BottomPanel() {
  const { panel, terminalTabs } = useApp()
  const open = useStore(panel, selectOpen)
  const current = useStore(panel, selectTab)
  const height = useStore(panel, selectHeight)
  const terminals = useStore(terminalTabs, selectTabs)
  const loaded = useStore(terminalTabs, selectLoaded)
  const conflicts = selectConflicts(useStage())
  const conflictCount = conflicts ? conflicts.split('\n').length : 0
  // While git waits on a merge, rebase, pick or revert, the panel has a Merge tab for it.
  const merging = Boolean(useGit().status?.operation) || conflictCount > 0
  // Once shown, the panel stays mounted while hidden, so shells keep their screens and scrollback.
  const [seen, setSeen] = useState(open)
  useEffect(() => {
    if (open) setSeen(true)
  }, [open])

  // A closed terminal hands its place to its neighbour, or to the output. After a reload, the tab it showed may
  // still be on its way back from the server.
  useEffect(() => {
    const gone =
      current === 'merge' ? !merging : loaded && current !== 'output' && !terminals.some((tab) => tab.key === current)
    if (gone) panel.show(terminals.at(-1)?.key ?? 'output')
  }, [loaded, current, terminals, panel, merging])

  // Hidden, the panel folds to nothing instead of leaving, so its shells keep running.
  const fold = useRef<ResizablePanelHandle | null>(null)
  // Its props stay the same from render to render: a changed one makes the group measure every panel again,
  // which restyles the whole page.
  const [startHeight] = useState(height)
  const keepHeight = useCallback(
    (size: { inPixels: number }, _id: string | number | undefined, previous: unknown) => {
      if (previous === undefined) return
      // Dragged shut, it closes as the hide button would; otherwise its height is kept.
      if (size.inPixels === 0) {
        if (panel.get().open) panel.toggle()
      } else if (size.inPixels >= MIN_HEIGHT) panel.resize(Math.round(size.inPixels))
    },
    [panel],
  )
  useEffect(() => {
    // A frame later: a panel that has just mounted is not in its group's layout until then.
    const frame = requestAnimationFrame(() => {
      const handle = fold.current
      if (!handle || open !== handle.isCollapsed()) return
      if (open) handle.expand()
      else handle.collapse()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  if (!seen && !open) return null
  const newTerminal = () => panel.show(terminalTabs.add().key)

  return (
    <>
      <ResizableHandle
        withHandle={false}
        aria-label="Resize the bottom panel"
        disabled={!open}
        className={open ? undefined : 'hidden'}
      />
      <ResizablePanel
        id="bottom"
        panelRef={fold}
        collapsible
        collapsedSize={0}
        defaultSize={startHeight}
        minSize={MIN_HEIGHT}
        maxSize="80%"
        groupResizeBehavior="preserve-pixel-size"
        onResize={keepHeight}>
        <section data-region="panel" aria-label="Bottom panel" className="flex h-full flex-col bg-background">
          <div className="flex h-9 shrink-0 items-stretch border-border border-b bg-card">
            <div role="tablist" aria-label="Panel" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
              <PanelTab
                selected={current === 'output'}
                label="Output"
                icon={<ScrollText className="size-4 shrink-0" />}
                onSelect={() => panel.show('output')}
              />
              {merging ? (
                <PanelTab
                  selected={current === 'merge'}
                  label="Merge"
                  icon={<GitMerge className="size-4 shrink-0 text-tn-magenta" />}
                  count={conflictCount}
                  onSelect={() => panel.show('merge')}
                />
              ) : null}
              {terminals.map((tab) => (
                <PanelTab
                  key={tab.key}
                  selected={current === tab.key}
                  label={tab.title}
                  name={tab.name}
                  icon={<SquareTerminal className="size-4 shrink-0" />}
                  onSelect={() => panel.show(tab.key)}
                  onClose={() => terminalTabs.close(tab.key)}
                />
              ))}
            </div>
            <div className="flex items-center gap-1 px-1">
              <IconTool label="New terminal" onClick={newTerminal}>
                <Plus />
              </IconTool>
              <IconTool label="Hide the panel" tip="Hide the panel (Ctrl `)" onClick={panel.toggle}>
                <X />
              </IconTool>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            {current === 'output' ? <OutputView /> : null}
            {current === 'merge' && merging ? <MergePanel /> : null}
            {terminals.map((tab) => (
              <TerminalPane key={tab.key} tab={tab} active={open && current === tab.key} />
            ))}
          </div>
        </section>
      </ResizablePanel>
    </>
  )
}
