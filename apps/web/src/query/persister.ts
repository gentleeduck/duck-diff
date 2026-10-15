import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

// The query cache is saved through the server, per repo, beside duck-diff's other caches; the browser keeps
// none of it. The server puts the saved copy into the page (QueryProvider reads it), so this only saves,
// throttled: the cache changes with every answer.
export function createServerPersister({
  put,
  throttleMs = 2000,
}: {
  put(text: string): Promise<void>
  throttleMs?: number
}): Persister {
  let latest: PersistedClient | null = null
  let waiting = false
  return {
    persistClient(client) {
      latest = client
      if (waiting) return
      waiting = true
      setTimeout(() => {
        waiting = false
        if (latest) put(JSON.stringify(latest)).catch(() => {})
      }, throttleMs)
    },
    restoreClient: async () => undefined,
    async removeClient() {
      latest = null
      await put('').catch(() => {})
    },
  }
}

export const pagePersister = () =>
  createServerPersister({
    put: async (text) => {
      await fetch('/api/state/queries', { method: 'PUT', body: text, keepalive: text.length < 60_000 })
    },
  })
