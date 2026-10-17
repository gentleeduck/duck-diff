import type { ChangedFile, DiffTarget } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { createViewedStore, viewedPaths } from '../viewed'

const UNSTAGED: DiffTarget = { kind: 'unstaged' }
const file = (path: string, newSha = 'n1'): ChangedFile => ({
  path,
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
  oldSha: 'o1',
  newSha,
})

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  }
}

describe('viewed files', () => {
  it('toggles a file on one target only', () => {
    const viewed = createViewedStore(memory())
    viewed.toggle(UNSTAGED, file('a.ts'))
    expect(viewedPaths(viewed.get(), UNSTAGED, [file('a.ts'), file('b.ts')])).toEqual(new Set(['a.ts']))
    expect(viewedPaths(viewed.get(), { kind: 'staged' }, [file('a.ts')])).toEqual(new Set())
    viewed.toggle(UNSTAGED, file('a.ts'))
    expect(viewedPaths(viewed.get(), UNSTAGED, [file('a.ts')])).toEqual(new Set())
  })

  it('keeps each repository its own marks, starting from the list they all shared before', () => {
    const storage = memory()
    storage.setItem('duck-diff:viewed', JSON.stringify({ unstaged: ['a.ts@n1'] }))
    const first = createViewedStore(storage)
    first.restore('/one')
    expect(viewedPaths(first.get(), UNSTAGED, [file('a.ts')])).toEqual(new Set(['a.ts']))
    first.toggle(UNSTAGED, file('b.ts'))
    const second = createViewedStore(storage)
    second.restore('/two')
    second.toggle(UNSTAGED, file('a.ts'))
    expect(viewedPaths(second.get(), UNSTAGED, [file('a.ts'), file('b.ts')])).toEqual(new Set())
    // Back in the first repository after a restart, its marks are as they were left.
    const again = createViewedStore(storage)
    again.restore('/one')
    expect(viewedPaths(again.get(), UNSTAGED, [file('a.ts'), file('b.ts')])).toEqual(new Set(['a.ts', 'b.ts']))
  })

  it('forgets a file once its content changes', () => {
    const viewed = createViewedStore(memory())
    viewed.toggle(UNSTAGED, file('a.ts', 'n1'))
    expect(viewedPaths(viewed.get(), UNSTAGED, [file('a.ts', 'n2')])).toEqual(new Set())
  })

  it('survives a reload and ignores broken storage', () => {
    const storage = memory()
    createViewedStore(storage).toggle(UNSTAGED, file('a.ts'))
    expect(viewedPaths(createViewedStore(storage).get(), UNSTAGED, [file('a.ts')])).toEqual(new Set(['a.ts']))
    storage.setItem('duck-diff:viewed', '{nope')
    expect(createViewedStore(storage).get()).toEqual({})
  })
})
