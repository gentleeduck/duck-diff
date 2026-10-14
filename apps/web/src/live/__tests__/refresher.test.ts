import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRefresher } from '../refresher'

afterEach(() => vi.useRealTimers())

describe('createRefresher', () => {
  it('reloads once per burst of notifications', async () => {
    vi.useFakeTimers()
    const reload = vi.fn(async () => {})
    const refresher = createRefresher(reload, 150)
    refresher.notify()
    refresher.notify()
    vi.advanceTimersByTime(100)
    refresher.notify()
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('queues exactly one more reload when notified during a reload', async () => {
    vi.useFakeTimers()
    let finish: () => void = () => {}
    const reload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const refresher = createRefresher(reload, 150)
    refresher.notify()
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
    refresher.notify()
    refresher.notify()
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(reload).toHaveBeenCalledTimes(2)
    finish()
    await vi.advanceTimersByTimeAsync(500)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does nothing after dispose', async () => {
    vi.useFakeTimers()
    const reload = vi.fn(async () => {})
    const refresher = createRefresher(reload, 150)
    refresher.notify()
    refresher.dispose()
    await vi.advanceTimersByTimeAsync(500)
    expect(reload).not.toHaveBeenCalled()
  })
})
