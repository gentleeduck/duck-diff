import { describe, expect, it, vi } from 'vitest'
import { createServerPersister } from '../persister'

const client = { timestamp: 1, buster: '1', clientState: { queries: [], mutations: [] } }

describe('server persister', () => {
  it('saves the query cache to the server at most once a throttle, with the latest state', async () => {
    vi.useFakeTimers()
    const put = vi.fn(async () => {})
    const persister = createServerPersister({ put, throttleMs: 1000 })
    await persister.persistClient(client)
    await persister.persistClient({ ...client, timestamp: 2 })
    expect(put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(put).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ ...client, timestamp: 2 }))
    vi.useRealTimers()
  })
})
