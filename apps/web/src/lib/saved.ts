// What the page remembers between visits (settings, keys, panel sizes, tabs, viewed files) lives on the server,
// in duck-diff's data folder, not in the browser: clearing the browser loses nothing. The server puts the
// values into the page, so stores read them as they are created; changes go back in batches.
export interface SavedStorage extends Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  // Values saved elsewhere (another page, or a server for another repo). A key this page changed and has not
  // sent yet keeps its own value, which is on its way to the server. With all, changes is every value there
  // is, and a key missing from it was removed.
  apply(changes: Changes, all?: boolean): void
  // Told each key that apply changed, so a store can read it again.
  subscribe(listener: (key: string) => void): () => void
}

type Changes = Record<string, string | null>

const PREFIX = 'duck-diff:'
// Caches an older build kept in the browser; the server has its own, so these are only cleared.
const CACHES = /^duck-diff:(queries|items):/
// Short: on a reload the new page is asked for before the old one leaves, so a change still waiting
// here would miss it.
const SEND_MS = 50

export function createSavedStorage({
  initial,
  send,
  browser,
}: {
  initial: Record<string, string>
  send(changes: Changes): Promise<void>
  // Where an older build kept these; anything there moves to the server once and leaves the browser.
  browser: Pick<Storage, 'getItem' | 'removeItem' | 'key' | 'length'> | null
}): SavedStorage & { flush(): void } {
  const values = new Map(Object.entries(initial))
  const listeners = new Set<(key: string) => void>()
  let pending: Changes = {}
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const changes = pending
    pending = {}
    if (Object.keys(changes).length) send(changes).catch(() => {})
  }
  const queue = (key: string, value: string | null) => {
    pending[key] = value
    timer ??= setTimeout(flush, SEND_MS)
  }

  if (browser) {
    try {
      const keys = Array.from({ length: browser.length }, (_, index) => browser.key(index)).filter(
        (key): key is string => Boolean(key?.startsWith(PREFIX)),
      )
      for (const key of keys) {
        const value = browser.getItem(key)
        if (value !== null && !values.has(key) && !CACHES.test(key)) {
          values.set(key, value)
          queue(key, value)
        }
        browser.removeItem(key)
      }
    } catch {}
  }

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (values.get(key) === value) return
      values.set(key, value)
      queue(key, value)
    },
    removeItem(key) {
      if (!values.has(key)) return
      values.delete(key)
      queue(key, null)
    },
    apply(changes, all = false) {
      const next: Changes = { ...changes }
      if (all) for (const key of values.keys()) if (!(key in changes)) next[key] = null
      for (const [key, value] of Object.entries(next)) {
        if (key in pending || (values.get(key) ?? null) === value) continue
        if (value === null) values.delete(key)
        else values.set(key, value)
        for (const listener of listeners) listener(key)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    flush,
  }
}

// Runs reload whenever another page or server saved key, for a store built on a storage that can tell.
export function onSavedElsewhere(storage: unknown, key: string, reload: () => void): void {
  const source = storage as Partial<Pick<SavedStorage, 'subscribe'>> | null
  source?.subscribe?.((changed) => {
    if (changed === key) reload()
  })
}

function pageValues(): Record<string, string> | null {
  if (typeof document === 'undefined') return null
  const script = document.getElementById('duck-diff-state')
  if (!script?.textContent) return null
  try {
    return JSON.parse(script.textContent) as Record<string, string>
  } catch {
    return null
  }
}

function createPageStorage(): SavedStorage {
  const initial = pageValues()
  // Without the server's values (the Vite dev server, tests) the browser keeps them, as before.
  if (!initial) {
    const local = globalThis.localStorage
    return {
      getItem: (key) => local.getItem(key),
      setItem: (key, value) => local.setItem(key, value),
      removeItem: (key) => local.removeItem(key),
      apply: () => {},
      subscribe: () => () => {},
    }
  }
  const saved = createSavedStorage({
    initial,
    send: async (changes) => {
      await fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes }),
        // Still sent when the page is closing.
        keepalive: true,
      })
    },
    browser: globalThis.localStorage ?? null,
  })
  window.addEventListener('pagehide', saved.flush)
  return saved
}

export const saved: SavedStorage = createPageStorage()
// True when the page came from duck-diff's server, which keeps what the page saves.
export const onServer = pageValues() !== null
