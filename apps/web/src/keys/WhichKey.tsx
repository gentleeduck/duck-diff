import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { buildBindings, type Overrides } from './bindings'
import { COMMANDS } from './commands'
import type { KeyState } from './state'
import { continuations, showKeys } from './which'

const selectPending = (state: KeyState) => state.pending.join(' ')
const selectMode = (state: KeyState) => state.mode
const selectOverrides = (state: Overrides) => state
const DELAY_MS = 300

// After a short pause on a chord, the keys that can follow, as folke's which-key shows them.
export function WhichKey() {
  const { keys, keyOverrides, view } = useApp()
  const pending = useStore(keys, selectPending)
  const mode = useStore(keys, selectMode)
  const overrides = useStore(keyOverrides, selectOverrides)
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown('')
    if (!pending) return
    const timer = setTimeout(() => setShown(pending), DELAY_MS)
    return () => clearTimeout(timer)
  }, [pending])

  const bindings = useMemo(
    () =>
      buildBindings(COMMANDS, overrides, {
        anywhere: () => true,
        diff: () => view.get() === 'changes',
        panel: () => Boolean(document.activeElement?.closest('[data-region="panel"]')),
        list: () => false,
      }),
    [overrides, view],
  )
  if (!shown || shown !== pending) return null
  const held = shown.split(' ')
  const next = continuations(bindings, held, mode)
  if (!next.length) return null
  return (
    <aside
      aria-label="Keys that can follow"
      className="fixed inset-x-3 bottom-9 z-50 rounded-md border border-border bg-popover px-4 py-3 shadow-lg">
      <p className="mb-2 text-muted-foreground">{showKeys(held)}</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-6 gap-y-1">
        {next.map((entry) => (
          <li key={entry.key} className="grid min-w-0 grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] items-center gap-1">
            <span className="truncate text-end text-tn-blue">
              {showKeys([entry.key]).replace('<leader>', '<Space>')}
            </span>
            <span className="text-center text-muted-foreground">-&gt;</span>
            <span className={`min-w-0 truncate pe-0.5 ${entry.group ? 'text-tn-magenta' : 'text-foreground'}`}>
              {entry.group ? `+${entry.label}` : entry.label}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
