import { FlaskConical, FlaskConicalOff } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'

const NEXT: Record<Settings['tests'], Settings['tests']> = { show: 'fold', fold: 'hide', hide: 'show' }
const TIP: Record<Settings['tests'], string> = {
  show: 'Test files shown: click to fold them',
  fold: 'Test files folded: click to hide them',
  hide: 'Test files hidden: click to show them',
}
const selectTests = (state: Settings) => state.tests

// One click cycles test files through shown, folded and hidden, in the diff and the tree alike.
export function TestsToggle() {
  const { settings } = useApp()
  const tests = useSettings(selectTests)
  return (
    <span className={tests === 'show' ? '' : 'text-tn-yellow'}>
      <IconTool label={TIP[tests]} onClick={() => settings.set((prev) => ({ ...prev, tests: NEXT[prev.tests] }))}>
        {tests === 'hide' ? <FlaskConicalOff /> : <FlaskConical />}
      </IconTool>
    </span>
  )
}
