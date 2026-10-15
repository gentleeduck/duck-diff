import { COMMANDS, PREFIXES } from './commands'
import type { Binding, Mode } from './engine'

const TITLES = new Map(COMMANDS.map((spec) => [spec.id, spec.title]))
const NAMES: Record<string, string> = {
  space: 'Space',
  esc: 'Esc',
  enter: 'CR',
  tab: 'Tab',
  backspace: 'BS',
  delete: 'Del',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
}
const MODS: Record<string, string> = { ctrl: 'C', alt: 'A', meta: 'D', shift: 'S' }

// Keys as vim notation, the way the keymaps list and the status bar show them.
export function showKeys(keys: string[]): string {
  return keys
    .map((key, at) => {
      if (key === 'space' && at === 0) return '<leader>'
      const parts = key.split('+')
      const last = key.endsWith('++') ? '+' : (parts.pop() ?? '')
      const mods = (key.endsWith('++') ? parts.slice(0, -1) : parts).map((mod) => MODS[mod] ?? mod)
      const name = NAMES[last] ?? last
      if (!mods.length) return NAMES[last] ? `<${name}>` : name
      return `<${[...mods, name].join('-')}>`
    })
    .join('')
}

export interface Continuation {
  key: string
  label: string
  // More keys follow; a group shows its name, or the command it runs when typed alone.
  group: boolean
}

export function continuations(bindings: Binding[], pending: string[], mode: Mode): Continuation[] {
  const next = new Map<string, Continuation>()
  for (const binding of bindings) {
    if (!binding.modes.includes(mode) || binding.keys.length <= pending.length) continue
    if (!pending.every((key, at) => binding.keys[at] === key)) continue
    if (binding.when && !binding.when()) continue
    const key = binding.keys[pending.length] as string
    const deeper = binding.keys.length > pending.length + 1
    const seen = next.get(key)
    const prefix = [...pending, key].join(' ')
    if (deeper) {
      next.set(key, {
        key,
        label: seen && !seen.group ? seen.label : (PREFIXES[prefix] ?? seen?.label ?? '+more'),
        group: true,
      })
    } else {
      next.set(key, { key, label: TITLES.get(binding.command) ?? binding.command, group: Boolean(seen?.group) })
    }
  }
  return [...next.values()].sort((a, b) => a.key.localeCompare(b.key))
}
