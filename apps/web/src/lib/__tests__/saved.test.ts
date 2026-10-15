import { describe, expect, it, vi } from 'vitest'
import { createSavedStorage } from '../saved'

const memory = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
    map,
  }
}

describe('saved storage', () => {
  it('reads what the server put in the page and sends changes back in one batch', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => {})
    const saved = createSavedStorage({ initial: { a: '1' }, send, browser: null })
    expect(saved.getItem('a')).toBe('1')
    saved.setItem('b', '2')
    saved.setItem('b', '3')
    saved.removeItem('a')
    expect(saved.getItem('b')).toBe('3')
    expect(send).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledExactlyOnceWith({ b: '3', a: null })
    vi.useRealTimers()
  })

  it('moves what an older build left in the browser to the server, once', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => {})
    const browser = memory({ 'duck-diff:settings': 's', 'duck-diff:queries:abc': 'big', 'other-site': 'x' })
    const saved = createSavedStorage({ initial: {}, send, browser })
    expect(saved.getItem('duck-diff:settings')).toBe('s')
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledWith({ 'duck-diff:settings': 's' })
    expect(browser.map.has('duck-diff:settings')).toBe(false)
    // The old browser query cache is dropped, not moved.
    expect(browser.map.has('duck-diff:queries:abc')).toBe(false)
    expect(browser.map.get('other-site')).toBe('x')
    vi.useRealTimers()
  })

  it('keeps the server copy when both have a key', () => {
    const browser = memory({ 'duck-diff:settings': 'old' })
    const saved = createSavedStorage({ initial: { 'duck-diff:settings': 'new' }, send: async () => {}, browser })
    expect(saved.getItem('duck-diff:settings')).toBe('new')
  })
})
