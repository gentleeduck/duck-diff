import type { CommandSpec, Context } from './commands'
import { type Binding, type Mode, parseKeys } from './engine'

export type Overrides = Record<string, string[]>

// Typing and shells keep every key that is not a chord with ctrl, alt or meta, or Escape.
const typedSafe = (keys: string[]) => /^(ctrl|alt|meta)\+/.test(keys[0] ?? '') || keys[0] === 'esc'

function entries(commands: CommandSpec[], overrides: Overrides) {
  return commands.flatMap((spec) =>
    (overrides[spec.id] ?? spec.keys).flatMap((notation) => {
      let keys: string[]
      try {
        keys = parseKeys(notation)
      } catch {
        return []
      }
      const modes = (spec.modes ?? ['normal']).filter((mode: Mode) => mode === 'normal' || typedSafe(keys))
      return modes.length ? [{ spec, keys, modes }] : []
    }),
  )
}

export function buildBindings(
  commands: CommandSpec[],
  overrides: Overrides,
  contexts: Record<Context, () => boolean>,
): Binding[] {
  const list = entries(commands, overrides).map(({ spec, keys, modes }) => ({
    keys,
    command: spec.id,
    modes,
    when: spec.when && spec.when !== 'anywhere' ? contexts[spec.when] : undefined,
    placed: Boolean(spec.when && spec.when !== 'anywhere' && spec.when !== 'diff'),
  }))
  return [...list.filter((entry) => entry.placed), ...list.filter((entry) => !entry.placed)].map(
    ({ placed: _, ...binding }) => binding,
  )
}

// Two commands on the same keys, in a shared mode and the same place, where only the first could ever run.
// The diff is part of the page; the panel and lists are places of their own whose keys shadow the page's.
export function conflicts(commands: CommandSpec[], overrides: Overrides): { keys: string; commands: string[] }[] {
  const seen = new Map<string, Set<string>>()
  for (const { spec, keys, modes } of entries(commands, overrides)) {
    for (const mode of modes) {
      const place = spec.when === 'panel' || spec.when === 'list' ? spec.when : 'page'
      const slot = `${mode}|${place}|${keys.join(' ')}`
      const ids = seen.get(slot) ?? new Set()
      ids.add(spec.id)
      seen.set(slot, ids)
    }
  }
  const found = new Map<string, string[]>()
  for (const [slot, ids] of seen) {
    if (ids.size < 2) continue
    const keys = slot.split('|')[2] as string
    found.set(`${keys}|${[...ids].sort().join(',')}`, [...ids].sort())
  }
  return [...found.entries()].map(([key, ids]) => ({ keys: key.split('|')[0] as string, commands: ids }))
}
