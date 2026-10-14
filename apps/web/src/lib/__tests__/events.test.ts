import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectEvents, type EventsStatus } from '../events'

class FakeSocket {
  static all: FakeSocket[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  closed = false
  constructor(readonly url: string) {
    FakeSocket.all.push(this)
  }
  close() {
    this.closed = true
    this.onclose?.()
  }
}

const factory = (url: string) => new FakeSocket(url) as unknown as WebSocket

afterEach(() => {
  FakeSocket.all = []
  vi.useRealTimers()
})

describe('connectEvents', () => {
  it('forwards valid events and ignores invalid ones', () => {
    const events: unknown[] = []
    connectEvents({ url: 'ws://x/api/events', onEvent: (event) => events.push(event), socketFactory: factory })
    const socket = FakeSocket.all[0]
    socket?.onopen?.()
    socket?.onmessage?.({ data: JSON.stringify({ type: 'changed', reason: 'index' }) })
    socket?.onmessage?.({ data: '{"type":"nope"}' })
    socket?.onmessage?.({ data: 'not json' })
    expect(events).toEqual([{ type: 'changed', reason: 'index' }])
  })

  it('reconnects with backoff and reports status', () => {
    vi.useFakeTimers()
    const statuses: EventsStatus[] = []
    connectEvents({
      url: 'ws://x/api/events',
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
      socketFactory: factory,
      retryMs: { min: 100, max: 400 },
    })
    FakeSocket.all[0]?.onopen?.()
    FakeSocket.all[0]?.onclose?.()
    expect(FakeSocket.all.length).toBe(1)
    vi.advanceTimersByTime(100)
    expect(FakeSocket.all.length).toBe(2)
    FakeSocket.all[1]?.onclose?.()
    vi.advanceTimersByTime(199)
    expect(FakeSocket.all.length).toBe(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all.length).toBe(3)
    expect(statuses.slice(0, 3)).toEqual(['connecting', 'open', 'closed'])
  })

  it('stops reconnecting after dispose', () => {
    vi.useFakeTimers()
    const dispose = connectEvents({
      url: 'ws://x/api/events',
      onEvent: () => {},
      socketFactory: factory,
      retryMs: { min: 100, max: 400 },
    })
    dispose()
    vi.advanceTimersByTime(1000)
    expect(FakeSocket.all.length).toBe(1)
    expect(FakeSocket.all[0]?.closed).toBe(true)
  })
})
