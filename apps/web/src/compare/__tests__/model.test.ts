import { describe, expect, it } from 'vitest'
import { describeTarget, historyTarget, presets, withoutPath, withSide } from '../model'

const SHA = '3f2a91c4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0'

describe('describeTarget', () => {
  it('names both sides', () => {
    expect(describeTarget({ kind: 'local' })).toEqual({ from: 'HEAD', to: 'working tree', path: null })
    expect(describeTarget({ kind: 'staged' })).toEqual({ from: 'HEAD', to: 'staged', path: null })
    expect(describeTarget({ kind: 'unstaged' })).toEqual({ from: 'staged', to: 'working tree', path: null })
    expect(describeTarget({ kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })).toEqual({
      from: 'main',
      to: 'feat',
      path: null,
    })
    expect(describeTarget({ kind: 'range', from: SHA, to: 'feat', mode: 'two-dot' }).from).toBe('3f2a91c')
    expect(
      describeTarget({ kind: 'range', from: 'origin/main', to: 'refs/duck-diff/pr/12', mode: 'merge-base' }).to,
    ).toBe('PR #12')
    expect(describeTarget({ kind: 'commit', sha: SHA })).toEqual({ from: '3f2a91c^', to: '3f2a91c', path: null })
  })
})

describe('withSide', () => {
  it('turns two refs into a merge-base range by default', () => {
    expect(withSide({ kind: 'local' }, 'to', { kind: 'ref', name: 'feat' })).toEqual({
      kind: 'range',
      from: 'HEAD',
      to: 'feat',
      mode: 'merge-base',
    })
  })

  it('keeps the current range mode', () => {
    const target = { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' } as const
    expect(withSide(target, 'from', { kind: 'ref', name: 'v1' })).toEqual({ ...target, from: 'v1' })
  })

  it('maps the special states onto local, staged and unstaged', () => {
    const range = { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' } as const
    expect(withSide(range, 'to', { kind: 'worktree' })).toEqual({ kind: 'local' })
    expect(withSide(range, 'to', { kind: 'index' })).toEqual({ kind: 'staged' })
    expect(withSide({ kind: 'local' }, 'from', { kind: 'index' })).toEqual({ kind: 'unstaged' })
    expect(withSide({ kind: 'unstaged' }, 'from', { kind: 'ref', name: 'HEAD' })).toEqual({ kind: 'local' })
  })
})

describe('presets', () => {
  it('offers local states, and the branch against the default branch when there is one', () => {
    expect(presets(['main', 'feat']).map((p) => p.label)).toEqual([
      'Local changes',
      'Staged',
      'Unstaged',
      'This branch against main',
    ])
    expect(presets(['master']).at(-1)?.target).toEqual({
      kind: 'range',
      from: 'master',
      to: 'HEAD',
      mode: 'merge-base',
    })
    expect(presets(['dev']).map((p) => p.label)).toEqual(['Local changes', 'Staged', 'Unstaged'])
  })
})

describe('one file', () => {
  const OLD = 'b'.repeat(40)
  const NEW = 'a'.repeat(40)

  it('describes the path and keeps it while the endpoints change', () => {
    const target = { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot', path: 'src/a.ts' } as const
    expect(describeTarget(target).path).toBe('src/a.ts')
    expect(describeTarget({ kind: 'local' }).path).toBeNull()
    expect(withSide(target, 'from', { kind: 'ref', name: 'v1' })).toEqual({ ...target, from: 'v1' })
    expect(withoutPath(target)).toEqual({ kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })
  })

  it('opens one commit, or the span between two picked commits oldest first', () => {
    const order = [NEW, OLD]
    expect(historyTarget('a.ts', order, NEW)).toEqual({ kind: 'commit', sha: NEW, path: 'a.ts' })
    expect(historyTarget('a.ts', order, NEW, OLD)).toEqual({
      kind: 'range',
      from: OLD,
      to: NEW,
      mode: 'two-dot',
      path: 'a.ts',
    })
    expect(historyTarget('a.ts', order, OLD, NEW)).toEqual(historyTarget('a.ts', order, NEW, OLD))
    expect(historyTarget('a.ts', order, NEW, NEW)).toEqual({ kind: 'commit', sha: NEW, path: 'a.ts' })
  })
})
