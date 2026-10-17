import type { DiffTarget } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { createStore } from '../../lib/store'
import { DEFAULT_TARGET, type Place, readPlace } from '../../router/place'
import { rememberTarget } from '../last-target'

function memory() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

describe('the comparison a repo last showed', () => {
  it('is kept as it changes, and forgotten once it is the working tree again', () => {
    const storage = memory()
    const place = createStore<Place>(readPlace('/changes', ''))
    const forget = rememberTarget('/repo', place, storage)
    expect(storage.data.size).toBe(0)
    const range: DiffTarget = { kind: 'range', from: 'HEAD~2', to: 'HEAD', mode: 'merge-base' }
    place.set((now) => ({ ...now, target: range }))
    expect(JSON.parse(storage.getItem('duck-diff:target:/repo') ?? 'null')).toEqual(range)
    place.set((now) => ({ ...now, target: DEFAULT_TARGET }))
    expect(storage.data.size).toBe(0)
    forget()
    place.set((now) => ({ ...now, target: range }))
    expect(storage.data.size).toBe(0)
  })
})
