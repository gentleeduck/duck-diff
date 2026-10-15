// Vim-style key handling: notation like <leader>sf, chords that wait for their next key, modes, and the
// list of what can follow for which-key. Keys are case-sensitive (J is not j), so they are named here
// rather than through duck-vim's registry, which folds case.

export type Mode = 'normal' | 'insert' | 'terminal'

export interface Binding {
  keys: string[]
  command: string
  modes: Mode[]
  // Only bound while this holds, like a buffer-local map.
  when?: () => boolean
}

const NAMED: Record<string, string> = {
  leader: 'space',
  space: 'space',
  esc: 'esc',
  escape: 'esc',
  cr: 'enter',
  enter: 'enter',
  return: 'enter',
  tab: 'tab',
  bs: 'backspace',
  backspace: 'backspace',
  del: 'delete',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
  lt: '<',
  bar: '|',
  bslash: '\\',
}
const MODIFIERS: Record<string, string> = { c: 'ctrl', a: 'alt', m: 'alt', d: 'meta', s: 'shift' }
const ORDER = ['ctrl', 'alt', 'meta', 'shift']

function token(inner: string, leader: string): string {
  // <C--> is ctrl and minus.
  const minus = inner.endsWith('--')
  const parts = (minus ? inner.slice(0, -2) : inner).split('-')
  const last = minus ? '-' : (parts.pop() ?? '')
  const mods = new Set<string>()
  for (const part of parts) {
    const mod = MODIFIERS[part.toLowerCase()]
    if (!mod) throw new Error(`unknown key <${inner}>`)
    mods.add(mod)
  }
  const named = NAMED[last.toLowerCase()]
  if (!named && last.length !== 1) throw new Error(`unknown key <${inner}>`)
  let key = named === 'space' && last.toLowerCase() === 'leader' ? leader : (named ?? last)
  // With ctrl, alt or meta held, letters are named lowercase and shift is spelled out, as browsers report them.
  if (mods.size && key.length === 1) {
    if (key !== key.toLowerCase()) mods.add('shift')
    key = key.toLowerCase()
  }
  return [...ORDER.filter((mod) => mods.has(mod)), key].join('+')
}

export function parseKeys(notation: string, leader = 'space'): string[] {
  const keys: string[] = []
  for (let at = 0; at < notation.length; ) {
    if (notation[at] === '<') {
      const close = notation.indexOf('>', at + 2)
      if (close !== -1) {
        keys.push(token(notation.slice(at + 1, close), leader))
        at = close + 1
        continue
      }
    }
    const char = notation[at] as string
    keys.push(char === ' ' ? 'space' : char)
    at++
  }
  return keys
}

const EVENT_NAMES: Record<string, string> = {
  ' ': 'space',
  Escape: 'esc',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
}
const LONE = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified'])

interface KeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export function eventKey(event: KeyEventLike): string | null {
  if (LONE.has(event.key)) return null
  const named = EVENT_NAMES[event.key]
  const printable = !named && event.key.length === 1
  const mods: string[] = []
  if (event.ctrlKey) mods.push('ctrl')
  if (event.altKey) mods.push('alt')
  if (event.metaKey) mods.push('meta')
  // A printed character already says whether shift was down (J, ?); only named keys and lettered chords spell it.
  if (event.shiftKey && (!printable || (mods.length && /^[a-z]$/i.test(event.key)))) mods.push('shift')
  const key = named ?? (mods.length ? event.key.toLowerCase() : event.key)
  if (!named && !printable) return mods.length ? [...mods, event.key.toLowerCase()].join('+') : event.key.toLowerCase()
  return [...mods, key].join('+')
}

interface Node {
  children: Map<string, Node>
  bindings: Binding[]
}

const node = (): Node => ({ children: new Map(), bindings: [] })

export type FeedResult = 'run' | 'pending' | 'none'

export interface Dispatcher {
  feed(key: string, mode: Mode): FeedResult
  pending(): string[]
  // The keys that can follow what is pending, with their command (null for a group).
  next(mode: Mode): { key: string; command: string | null; more: boolean }[]
  reset(): void
  subscribe(listener: () => void): () => void
}

export function createDispatcher(
  bindings: Binding[],
  options: {
    timeoutMs: number
    run(command: string): void
    // Keys held for a chord that did not come, so a terminal can still receive them.
    drop?(keys: string[]): void
  },
): Dispatcher {
  const roots: Record<Mode, Node> = { normal: node(), insert: node(), terminal: node() }
  for (const binding of bindings) {
    for (const mode of binding.modes) {
      let at = roots[mode]
      for (const key of binding.keys) {
        let child = at.children.get(key)
        if (!child) {
          child = node()
          at.children.set(key, child)
        }
        at = child
      }
      at.bindings.push(binding)
    }
  }
  const listeners = new Set<() => void>()
  let held: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const pick = (at: Node) => at.bindings.find((binding) => !binding.when || binding.when())?.command ?? null
  const walk = (mode: Mode, keys: string[]) => {
    let at: Node | undefined = roots[mode]
    for (const key of keys) at = at?.children.get(key)
    return at ?? null
  }
  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function feed(key: string, mode: Mode): FeedResult {
    clear()
    const keys = [...held, key]
    const found = walk(mode, keys)
    const command = found ? pick(found) : null
    if (found?.children.size) {
      held = keys
      notify()
      // A prefix that is nothing on its own waits for its next key, with which-key open, as in Neovim. Only
      // a chord that is also a command, or keys a shell may still need, run out after the timeout.
      if (!command && mode !== 'terminal') return 'pending'
      timer = setTimeout(() => {
        timer = null
        held = []
        // The shorter chord wins once nothing longer follows, as with vim's timeoutlen.
        const late = pick(found)
        if (late) options.run(late)
        else options.drop?.(keys)
        notify()
      }, options.timeoutMs)
      return 'pending'
    }
    if (command) {
      held = []
      notify()
      options.run(command)
      return 'run'
    }
    if (held.length) {
      const dropped = held
      held = []
      options.drop?.(dropped)
      notify()
      return feed(key, mode)
    }
    return 'none'
  }

  return {
    feed,
    pending: () => held,
    next(mode) {
      const at = walk(mode, held)
      if (!at) return []
      return [...at.children.entries()]
        .map(([key, child]) => ({ key, command: pick(child), more: child.children.size > 0 }))
        .sort((a, b) => a.key.localeCompare(b.key))
    },
    reset() {
      clear()
      held = []
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
