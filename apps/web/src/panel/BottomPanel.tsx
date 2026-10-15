import { Plus, ScrollText, SquareTerminal, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useStore } from '../lib/store'
import { TerminalPane } from '../terminal/TerminalPane'
import type { TerminalTab } from '../terminal/tabs'
import { OutputView } from './OutputView'
import type { PanelState } from './panel'

const selectOpen = (state: PanelState) => state.open
const selectTab = (state: PanelState) => state.tab
const selectHeight = (state: PanelState) => state.height
const selectTabs = (state: { tabs: TerminalTab[] }) => state.tabs
const MIN_HEIGHT = 120
const clamp = (height: number) => Math.round(Math.max(MIN_HEIGHT, Math.min(window.innerHeight * 0.8, height)))

// Dragging the top edge resizes the panel, as in an editor.
function ResizeEdge({ height, onResize }: { height: number; onResize(height: number): void }) {
  return (
    <hr
      aria-orientation="horizontal"
      aria-label="Resize the bottom panel"
      onPointerDown={(event) => {
        event.preventDefault()
        const startY = event.clientY
        const move = (moved: PointerEvent) => onResize(clamp(height + startY - moved.clientY))
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.style.removeProperty('cursor')
        }
        document.body.style.cursor = 'row-resize'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      className="relative m-0 h-px w-full shrink-0 cursor-row-resize border-0 bg-border after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-tn-blue"
    />
  )
}

function PanelTab({
  selected,
  label,
  name = label,
  icon,
  onSelect,
  onClose,
}: {
  selected: boolean
  label: string
  // The fixed name, when the label is the shell title.
  name?: string
  icon: ReactNode
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
      {onClose ? (
        <button
          type="button"
          aria-label={`Close ${name}`}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-accent ${
            selected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}>
          <X className="size-3.5" />
        </button>
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
  // Once shown, the panel stays mounted while hidden, so shells keep their screens and scrollback.
  const [seen, setSeen] = useState(open)
  useEffect(() => {
    if (open) setSeen(true)
  }, [open])

  // A closed terminal hands its place to its neighbour, or to the output.
  useEffect(() => {
    if (current !== 'output' && !terminals.some((tab) => tab.key === current)) {
      panel.show(terminals.at(-1)?.key ?? 'output')
    }
  }, [current, terminals, panel])

  if (!seen && !open) return null
  const newTerminal = () => panel.show(terminalTabs.add().key)

  return (
    <div className={open ? 'contents' : 'hidden'}>
      <ResizeEdge height={height} onResize={panel.resize} />
      <section
        data-region="panel"
        aria-label="Bottom panel"
        style={{ height }}
        className="flex shrink-0 flex-col bg-background">
        <div className="flex h-9 shrink-0 items-stretch border-border border-b bg-card">
          <div role="tablist" aria-label="Panel" className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            <PanelTab
              selected={current === 'output'}
              label="Output"
              icon={<ScrollText className="size-4 shrink-0" />}
              onSelect={() => panel.show('output')}
            />
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
          {terminals.map((tab) => (
            <TerminalPane key={tab.key} tab={tab} active={open && current === tab.key} />
          ))}
        </div>
      </section>
    </div>
  )
}
