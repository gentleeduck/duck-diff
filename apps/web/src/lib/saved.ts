// What the page remembers between visits (settings, keys, panel sizes, tabs, viewed files) lives on the server,
// in duck-diff's data folder, not in the browser: clearing the browser loses nothing. The server puts the
// values into the page, so stores read them as they are created; changes go back in batches.
export type SavedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

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
    flush,
  }
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
  if (!initial) return globalThis.localStorage
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
