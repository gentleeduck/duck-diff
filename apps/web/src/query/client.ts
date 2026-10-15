import { type Query, QueryClient } from '@tanstack/react-query'

// Data here changes when the repo or GitHub says so, not with time: the server pushes an event per topic and
// that invalidates exactly the queries following it. Reads nothing pushes (releases, discussions) set their own
// staleTime.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Number.POSITIVE_INFINITY, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  })
}

export interface QueryMeta {
  // Live topics the query follows: GitHub ones (pulls, issues, notifications, runs, item:N) and the repo's own
  // (refs, index, worktree, reviews).
  topics?: readonly string[]
  // Kept through the server, so a reload paints from it while it is read again.
  persist?: boolean
}

export const topicsOf = (query: Query): readonly string[] => (query.meta as QueryMeta | undefined)?.topics ?? []

export function invalidateTopic(client: QueryClient, topic: string) {
  return client.invalidateQueries({ predicate: (query) => topicsOf(query).includes(topic) })
}

const GITHUB_TOPIC = /^(notifications|pulls|issues|runs|item:\d{1,9})$/

// The GitHub topics some page on screen follows, for the server's one poller.
export function watchedTopics(client: QueryClient): string[] {
  const topics = new Set<string>()
  for (const query of client.getQueryCache().getAll()) {
    // Disabled observers (a closed palette) need no pushes.
    if (!query.isActive()) continue
    for (const topic of topicsOf(query)) if (GITHUB_TOPIC.test(topic)) topics.add(topic)
  }
  return [...topics].sort()
}
