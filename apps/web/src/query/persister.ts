import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

// The query cache is saved through the server, per repo, beside duck-diff's other caches; the browser keeps
// none of it. Saves are throttled: the cache changes on every answer.
export function createServerPersister({
  get,
  put,
  throttleMs = 2000,
}: {
  get(): Promise<string | null>
  put(text: string): Promise<void>
  throttleMs?: number
}): Persister {
  let latest: PersistedClient | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    persistClient(client) {
      latest = client
      timer ??= setTimeout(() => {
        timer = null
        if (latest) put(JSON.stringify(latest)).catch(() => {})
      }, throttleMs)
    },
    async restoreClient() {
      try {
        const text = await get()
        return text ? (JSON.parse(text) as PersistedClient) : undefined
      } catch {
        return undefined
      }
    },
    async removeClient() {
      latest = null
      await put('').catch(() => {})
    },
  }
}

export const pagePersister = () =>
  createServerPersister({
    get: async () => {
      const response = await fetch('/api/state/queries')
      return response.status === 200 ? response.text() : null
    },
    put: async (text) => {
      await fetch('/api/state/queries', { method: 'PUT', body: text, keepalive: text.length < 60_000 })
    },
  })
