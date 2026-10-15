import { describe, expect, it, vi } from 'vitest'
import { createQueryCache, topicsFor } from '../query-cache'

describe('query cache', () => {
  it('reads once, shares a read in flight, and reads again only after its topic changes', async () => {
    const cache = createQueryCache()
    const load = vi.fn(async () => ({ n: load.mock.calls.length }))
    const [a, b] = await Promise.all([
      cache.get('/api/github/pulls?state=open', load),
      cache.get('/api/github/pulls?state=open', load),
    ])
    expect(a).toBe(b)
    expect(load).toHaveBeenCalledTimes(1)
    await cache.get('/api/github/pulls?state=open', load)
    expect(load).toHaveBeenCalledTimes(1)
    cache.invalidate('issues')
    await cache.get('/api/github/pulls?state=open', load)
    expect(load).toHaveBeenCalledTimes(1)
    cache.invalidate('pulls')
    expect(await cache.get('/api/github/pulls?state=open', load)).toEqual({ n: 2 })
  })

  it('forgets everything after a write, and a failed read is not kept', async () => {
    const cache = createQueryCache()
    const load = vi.fn(async () => 1)
    await cache.get('/api/github/releases', load)
    cache.clear()
    await cache.get('/api/github/releases', load)
    expect(load).toHaveBeenCalledTimes(2)
    const failing = vi.fn(async () => {
      throw new Error('down')
    })
    await expect(cache.get('/api/github/runs', failing)).rejects.toThrow('down')
    await expect(cache.get('/api/github/runs', failing)).rejects.toThrow('down')
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('keeps answers no event covers for a minute only', async () => {
    let now = 0
    const cache = createQueryCache(() => now)
    const load = vi.fn(async () => 1)
    await cache.get('/api/github/releases', load)
    now = 30_000
    await cache.get('/api/github/releases', load)
    now = 61_000
    await cache.get('/api/github/releases', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('names the topics a read belongs to', () => {
    expect(topicsFor('/api/github/pulls?state=open')).toEqual(['pulls'])
    expect(topicsFor('/api/github/list?kind=issue&q=x')).toEqual(['issues'])
    expect(topicsFor('/api/github/list?kind=pr')).toEqual(['pulls'])
    expect(topicsFor('/api/github/pulls/7/checks')).toEqual(['item:7', 'runs'])
    expect(topicsFor('/api/github/threads/12?kind=issue')).toEqual(['item:12'])
    expect(topicsFor('/api/github/notifications')).toEqual(['notifications'])
    expect(topicsFor('/api/github/runs')).toEqual(['runs'])
    expect(topicsFor('/api/github/releases')).toEqual([])
  })
})
