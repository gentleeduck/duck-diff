import { ArrowLeft, ArrowRight } from 'lucide-react'
import { back, forward, position } from '../lib/history'
import { useStore } from '../lib/store'
import { IconTool } from './IconTool'

const selectBack = (state: { index: number }) => state.index > 0
const selectForward = (state: { index: number; top: number }) => state.index < state.top

// The browser's own back and forward, in the page, for when it runs inside an editor or app window.
export function NavButtons() {
  const canBack = useStore(position, selectBack)
  const canForward = useStore(position, selectForward)
  return (
    <span className="flex shrink-0 items-center">
      <span className={canBack ? undefined : 'pointer-events-none opacity-40'}>
        <IconTool label="Back" tip="Back (Alt Left)" onClick={back}>
          <ArrowLeft />
        </IconTool>
      </span>
      <span className={canForward ? undefined : 'pointer-events-none opacity-40'}>
        <IconTool label="Forward" tip="Forward (Alt Right)" onClick={forward}>
          <ArrowRight />
        </IconTool>
      </span>
    </span>
  )
}
