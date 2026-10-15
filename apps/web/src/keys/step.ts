export type Move = 'next-hunk' | 'prev-hunk' | 'next-file' | 'prev-file'

export interface Position {
  item: number
  hunk: number
}

interface NavItem {
  hunks: readonly unknown[]
}

// Hunk steps cross file boundaries; both ends are sticky so holding a key never wraps around.
export function step(items: readonly NavItem[], at: Position, action: Move): Position {
  const last = items.length - 1
  if (action === 'next-file') return { item: Math.min(at.item + 1, last), hunk: 0 }
  if (action === 'prev-file') return { item: Math.max(at.item - 1, 0), hunk: 0 }
  if (action === 'next-hunk') {
    if (at.hunk + 1 < (items[at.item]?.hunks.length ?? 0)) return { item: at.item, hunk: at.hunk + 1 }
    for (let next = at.item + 1; next <= last; next++) if (items[next]?.hunks.length) return { item: next, hunk: 0 }
    return at
  }
  if (action === 'prev-hunk') {
    if (at.hunk > 0) return { item: at.item, hunk: at.hunk - 1 }
    for (let prev = at.item - 1; prev >= 0; prev--) {
      const count = items[prev]?.hunks.length ?? 0
      if (count) return { item: prev, hunk: count - 1 }
    }
    return at
  }
  return at
}
