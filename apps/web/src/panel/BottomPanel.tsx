import { ScrollText, X } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useStore } from '../lib/store'
import { OutputView } from './OutputView'
import type { PanelState } from './panel'

const selectPanel = (state: PanelState) => state
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

export function BottomPanel() {
  const { panel } = useApp()
  const state = useStore(panel, selectPanel)
  if (!state.open) return null
  return (
    <>
      <ResizeEdge height={state.height} onResize={panel.resize} />
      <section
        aria-label="Bottom panel"
        style={{ height: state.height }}
        className="flex shrink-0 flex-col bg-background">
        <div className="flex h-9 shrink-0 items-stretch border-border border-b bg-card">
          <div role="tablist" aria-label="Panel" className="flex min-w-0 flex-1 items-stretch">
            <button
              type="button"
              role="tab"
              aria-selected={state.tab === 'output'}
              onClick={() => panel.show('output')}
              className={`flex cursor-pointer items-center gap-1.5 border-border border-e px-3 ${
                state.tab === 'output'
                  ? 'bg-background text-foreground shadow-[inset_0_2px_0_var(--tn-blue)]'
                  : 'text-muted-foreground hover:bg-accent/40'
              }`}>
              <ScrollText className="size-4" />
              Output
            </button>
          </div>
          <div className="flex items-center pe-1">
            <IconTool label="Close the panel" tip="Close the panel (Ctrl `)" onClick={panel.toggle}>
              <X />
            </IconTool>
          </div>
        </div>
        <div className="min-h-0 flex-1">{state.tab === 'output' ? <OutputView /> : null}</div>
      </section>
    </>
  )
}
