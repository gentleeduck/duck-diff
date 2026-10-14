import { describe, expect, it } from 'vitest'
import { describeTarget, presets, toggleOperator, withSide } from '../model'

const SHA = '3f2a91c4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0'

describe('describeTarget', () => {
  it('names both sides and the operator', () => {
    expect(describeTarget({ kind: 'local' })).toEqual({ from: 'HEAD', to: 'working tree', operator: null })
    expect(describeTarget({ kind: 'staged' })).toEqual({ from: 'HEAD', to: 'staged', operator: null })
    expect(describeTarget({ kind: 'unstaged' })).toEqual({ from: 'staged', to: 'working tree', operator: null })
    expect(describeTarget({ kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })).toEqual({
      from: 'main',
      to: 'feat',
      operator: '..',
    })
    expect(describeTarget({ kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' }).operator).toBe('...')
    expect(describeTarget({ kind: 'commit', sha: SHA })).toEqual({ from: '3f2a91c^', to: '3f2a91c', operator: null })
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

describe('toggleOperator', () => {
  it('flips range modes and leaves other targets alone', () => {
    expect(toggleOperator({ kind: 'range', from: 'a', to: 'b', mode: 'two-dot' })).toMatchObject({ mode: 'merge-base' })
    expect(toggleOperator({ kind: 'range', from: 'a', to: 'b', mode: 'merge-base' })).toMatchObject({ mode: 'two-dot' })
    expect(toggleOperator({ kind: 'local' })).toEqual({ kind: 'local' })
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
