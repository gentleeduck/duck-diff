export type Action =
  | 'next-hunk'
  | 'prev-hunk'
  | 'next-file'
  | 'prev-file'
  | 'toggle-layout'
  | 'focus-filter'
  | 'help'
  | 'palette'
  | 'stage'
  | 'unstage'
  | 'discard'
  | 'comment'
  | 'viewed'
  | 'open'
  | 'view-changes'
  | 'view-graph'
  | 'view-files'
  | 'view-prs'
  | 'view-issues'
  | 'view-inbox'
  | 'view-releases'
  | 'view-actions'
  | 'toggle-sidebar'
  | 'font-bigger'
  | 'font-smaller'
  | 'font-reset'

interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  target: EventTarget | { tagName: string; isContentEditable: boolean } | null
}

const PLAIN: Record<string, Action> = {
  j: 'next-hunk',
  k: 'prev-hunk',
  J: 'next-file',
  K: 'prev-file',
  t: 'toggle-layout',
  '/': 'focus-filter',
  '?': 'help',
  s: 'stage',
  u: 'unstage',
  x: 'discard',
  c: 'comment',
  v: 'viewed',
  o: 'open',
  '1': 'view-changes',
  '2': 'view-graph',
  '3': 'view-files',
  '4': 'view-prs',
  '5': 'view-issues',
  '6': 'view-inbox',
  '7': 'view-releases',
  '8': 'view-actions',
}

function isTyping(target: KeyLike['target']): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || Boolean(element?.isContentEditable)
}

export function resolveKey(event: KeyLike): Action | null {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') return 'palette'
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') return 'toggle-sidebar'
  // The browser's own zoom keys size the page through the font settings instead, so they persist.
  if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) return 'font-bigger'
  if ((event.ctrlKey || event.metaKey) && event.key === '-') return 'font-smaller'
  if ((event.ctrlKey || event.metaKey) && event.key === '0') return 'font-reset'
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return null
  return PLAIN[event.key] ?? null
}

export interface Position {
  item: number
  hunk: number
}

interface NavItem {
  hunks: readonly unknown[]
}

// Hunk steps cross file boundaries; both ends are sticky so holding a key never wraps around.
export function step(items: readonly NavItem[], at: Position, action: Action): Position {
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
