import { describe, expect, it, vi } from 'vitest'
import { createSavedStorage } from '../../lib/saved'
import { createSettingsStore, DEFAULT_SETTINGS, panelShown, togglePanel } from '../settings'

function memoryStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
    data,
  }
}

describe('settings store', () => {
  it('starts from defaults and persists changes', () => {
    const storage = memoryStorage()
    const store = createSettingsStore(storage)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    store.set((prev) => ({ ...prev, diffStyle: 'unified' }))
    expect(JSON.parse(storage.data['duck-diff:settings'] ?? '{}').diffStyle).toBe('unified')
    expect(createSettingsStore(storage).get().diffStyle).toBe('unified')
  })

  it('ignores corrupt or partial stored values', () => {
    expect(createSettingsStore(memoryStorage({ 'duck-diff:settings': '{bad' })).get()).toEqual(DEFAULT_SETTINGS)
    const partial = createSettingsStore(memoryStorage({ 'duck-diff:settings': '{"fontSize":15,"diffStyle":"nope"}' }))
    expect(partial.get().fontSize).toBe(15)
    expect(partial.get().diffStyle).toBe(DEFAULT_SETTINGS.diffStyle)
  })

  it('works without storage', () => {
    const store = createSettingsStore(null)
    store.set((prev) => ({ ...prev, lineNumbers: false }))
    expect(store.get().lineNumbers).toBe(false)
  })

  it('takes settings another page saved, without saving them back', () => {
    const send = vi.fn(async () => {})
    const saved = createSavedStorage({ initial: {}, send, browser: null })
    const store = createSettingsStore(saved)
    const theirs = {
      ...DEFAULT_SETTINGS,
      hidePatterns: [{ id: 'docs', label: 'Docs', pattern: '^docs/', enabled: true }],
    }
    saved.apply({ 'duck-diff:settings': JSON.stringify(theirs) })
    expect(store.get().hidePatterns.map((entry) => entry.pattern)).toEqual(['^docs/'])
    store.set((prev) => ({ ...prev, fontSize: 16 }))
    const kept = JSON.parse(saved.getItem('duck-diff:settings') ?? '{}')
    expect([kept.fontSize, kept.hidePatterns[0].pattern]).toEqual([16, '^docs/'])
  })
})

describe('left panels', () => {
  it("shows or hides one view's panel and leaves the others as they are", () => {
    const hidden = togglePanel(DEFAULT_SETTINGS, 'changes')
    expect(panelShown(hidden, 'changes')).toBe(false)
    expect(panelShown(hidden, 'files')).toBe(true)
    expect(panelShown(togglePanel(hidden, 'changes'), 'changes')).toBe(true)
    expect(togglePanel(hidden, 'changes', false)).toEqual(hidden)
  })
})
