// GitHub reads kept in the page: read the first time, served from memory after that, and read again only
// when the server reports a change to their topic or the page writes to GitHub.

const UNWATCHED_MS = 60_000

// The live topics a read follows, as the server's GitHub watcher names them.
export function topicsFor(path: string): string[] {
  const url = new URL(path, 'http://page')
  const parts = url.pathname.replace(/^\/api\/github\/?/, '').split('/')
  const [head = '', id] = parts
  const topics: string[] = []
  if (/^\d+$/.test(id ?? '') && ['pulls', 'issues', 'threads'].includes(head)) {
    topics.push(`item:${id}`)
    if (head === 'pulls' && parts[2] === 'checks') topics.push('runs')
  } else if (head === 'pulls') topics.push('pulls')
  else if (head === 'issues') topics.push('issues')
  else if (head === 'list') topics.push(url.searchParams.get('kind') === 'pr' ? 'pulls' : 'issues')
  else if (head === 'notifications') topics.push('notifications')
  else if (head === 'runs') topics.push('runs')
  return topics
}

interface Entry {
  value: Promise<unknown>
  topics: string[]
  at: number
  stale: boolean
}

export interface QueryCache {
  get<T>(key: string, load: () => Promise<T>): Promise<T>
  invalidate(topic: string): void
  clear(): void
}

export function createQueryCache(now: () => number = Date.now): QueryCache {
  const entries = new Map<string, Entry>()
  return {
    get<T>(key: string, load: () => Promise<T>) {
      const found = entries.get(key)
      const expired = found && !found.topics.length && now() - found.at > UNWATCHED_MS
      if (found && !found.stale && !expired) return found.value as Promise<T>
      const value = load()
      const entry: Entry = { value, topics: topicsFor(key), at: now(), stale: false }
      entries.set(key, entry)
      // A failed read is not kept, so the next visit tries again.
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key)
      })
      return value
    },
    invalidate(topic) {
      for (const entry of entries.values()) if (entry.topics.includes(topic)) entry.stale = true
    },
    clear() {
      entries.clear()
    },
  }
}
