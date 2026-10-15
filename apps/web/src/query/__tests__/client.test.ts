import { QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient, invalidateTopic, watchedTopics } from '../client'

describe('query client', () => {
  it('reads again only the queries following a topic, and lists the GitHub topics on screen', async () => {
    const client = createQueryClient()
    const pulls = vi.fn(async () => 1)
    const item = vi.fn(async () => 2)
    const refs = vi.fn(async () => 3)
    const observe = (key: string[], fn: () => Promise<number>, topics: string[]) => {
      const observer = new QueryObserver(client, { queryKey: key, queryFn: fn, meta: { topics } })
      return observer.subscribe(() => {})
    }
    const stops = [
      observe(['github', 'pulls'], pulls, ['pulls']),
      observe(['github', 'pull', '7'], item, ['item:7', 'runs']),
      observe(['git', 'refs'], refs, ['refs']),
    ]
    // Each first read has to settle before an invalidation can be told apart from it.
    await vi.waitFor(() =>
      expect(
        client
          .getQueryCache()
          .getAll()
          .every((query) => query.state.status === 'success'),
      ).toBe(true),
    )
    expect(watchedTopics(client)).toEqual(['item:7', 'pulls', 'runs'])

    await invalidateTopic(client, 'runs')
    await vi.waitFor(() => expect(item).toHaveBeenCalledTimes(2))
    expect(pulls).toHaveBeenCalledTimes(1)
    expect(refs).toHaveBeenCalledTimes(1)

    for (const stop of stops) stop()
    expect(watchedTopics(client)).toEqual([])
  })
})
