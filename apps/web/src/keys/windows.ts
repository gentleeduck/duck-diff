export type Direction = 'left' | 'right' | 'up' | 'down'

export interface Area {
  name: string
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
}

// The panel next to this one in a direction, picked the way Neovim's <C-w>h picks a window: of the panels on
// that side and overlapping this one across the move, the nearest, then the one that overlaps it most.
export function nextArea(areas: readonly Area[], from: Area, direction: Direction): string | null {
  const across = direction === 'left' || direction === 'right'
  let best: { name: string; gap: number; overlap: number } | null = null
  for (const area of areas) {
    if (area.name === from.name) continue
    const there = area.rect
    const here = from.rect
    const gap =
      direction === 'left'
        ? here.left - there.right
        : direction === 'right'
          ? there.left - here.right
          : direction === 'up'
            ? here.top - there.bottom
            : there.top - here.bottom
    // A pixel either way is the line between two panels.
    if (gap < -1) continue
    const overlap = across
      ? Math.min(there.bottom, here.bottom) - Math.max(there.top, here.top)
      : Math.min(there.right, here.right) - Math.max(there.left, here.left)
    if (overlap <= 0) continue
    if (!best || gap < best.gap - 1 || (Math.abs(gap - best.gap) <= 1 && overlap > best.overlap)) {
      best = { name: area.name, gap, overlap }
    }
  }
  return best?.name ?? null
}
