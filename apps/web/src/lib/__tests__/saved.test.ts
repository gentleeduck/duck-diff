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

  it('drops what a removed feature kept, on the server too', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => {})
    const saved = createSavedStorage({ initial: { 'duck-diff:keys': '{}', a: '1' }, send, browser: null })
    expect(saved.getItem('duck-diff:keys')).toBeNull()
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledExactlyOnceWith({ 'duck-diff:keys': null })
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

  it('takes values saved elsewhere, tells who listens, and sends none of them back', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => {})
    const saved = createSavedStorage({ initial: { a: '1', b: '1' }, send, browser: null })
    const told: string[] = []
    saved.subscribe((key) => told.push(key))
    saved.apply({ a: '2', b: '1', c: '3', gone: null })
    expect([saved.getItem('a'), saved.getItem('c')]).toEqual(['2', '3'])
    expect(told).toEqual(['a', 'c'])
    await vi.runAllTimersAsync()
    expect(send).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('keeps a change of its own that it has not sent yet', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => {})
    const saved = createSavedStorage({ initial: { a: '1' }, send, browser: null })
    saved.setItem('a', 'mine')
    saved.apply({ a: 'theirs' })
    expect(saved.getItem('a')).toBe('mine')
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledExactlyOnceWith({ a: 'mine' })
    vi.useRealTimers()
  })

  it('drops what is missing from every value the server sent, unless it is still on its way', async () => {
    vi.useFakeTimers()
    const saved = createSavedStorage({ initial: { gone: '1', kept: '1' }, send: async () => {}, browser: null })
    const told: string[] = []
    saved.subscribe((key) => told.push(key))
    saved.setItem('mine', 'x')
    saved.apply({ kept: '1' }, true)
    expect([saved.getItem('gone'), saved.getItem('kept'), saved.getItem('mine')]).toEqual([null, '1', 'x'])
    expect(told).toEqual(['gone'])
    vi.useRealTimers()
  })
})
