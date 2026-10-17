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

// Two commands on the same keys, in a shared mode and the same place, where only the first could ever run; or
// keys that are the start of other keys in a place where both apply, which run only after a pause, so the longer
// one is easy to miss into the shorter. The diff is part of the page; the panel and lists are places of their own
// whose keys shadow the page's.
export function conflicts(commands: CommandSpec[], overrides: Overrides): { keys: string; commands: string[] }[] {
  const bound = entries(commands, overrides).flatMap(({ spec, keys, modes }) =>
    modes.map((mode) => ({
      id: spec.id,
      keys,
      mode,
      place: spec.when === 'panel' || spec.when === 'list' ? spec.when : 'page',
    })),
  )
  const found = new Map<string, { keys: string; commands: string[] }>()
  const add = (keys: string[], ids: string[]) => {
    const sorted = [...new Set(ids)].sort()
    if (sorted.length > 1)
      found.set(`${keys.join(' ')}|${sorted.join(',')}`, { keys: keys.join(' '), commands: sorted })
  }
  for (const a of bound) {
    for (const b of bound) {
      if (a === b || a.mode !== b.mode || a.keys.length > b.keys.length) continue
      const same = a.keys.length === b.keys.length
      // The same keys clash in the same place; a start clashes wherever both apply, which the page's keys do.
      const shared = same ? a.place === b.place : a.place === b.place || a.place === 'page' || b.place === 'page'
      if (!shared || a.keys.some((key, i) => key !== b.keys[i])) continue
      add(a.keys, [a.id, b.id])
    }
  }
  return [...found.values()]
}
