import { describe, expect, it } from 'vitest'
import { describeTarget, historyTarget, presets, sideText, withoutPath, withSide } from '../model'

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

describe('sideText', () => {
  it('gives each picker the ref to edit, short where git prints it short, and nothing for the working tree or index', () => {
    expect(sideText({ kind: 'commit', sha: SHA })).toEqual({ from: '3f2a91c^', to: '3f2a91c' })
    expect(sideText({ kind: 'local' })).toEqual({ from: 'HEAD', to: '' })
    expect(sideText({ kind: 'unstaged' })).toEqual({ from: '', to: '' })
    expect(sideText({ kind: 'range', from: 'main', to: 'refs/duck-diff/pr/12', mode: 'merge-base' })).toEqual({
      from: 'main',
      to: 'refs/duck-diff/pr/12',
    })
  })
})

describe('withSide', () => {
  it('compares HEAD or a commit with another ref as they are, so an older commit is never an empty diff', () => {
    expect(withSide({ kind: 'local' }, 'to', { kind: 'ref', name: SHA })).toEqual({
      kind: 'range',
      from: 'HEAD',
      to: SHA,
      mode: 'two-dot',
    })
    const branches = { kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' } as const
    expect(withSide(branches, 'to', { kind: 'ref', name: SHA })).toEqual({ ...branches, to: SHA, mode: 'two-dot' })
  })

  it('compares two branches from where they split, as GitHub does', () => {
    expect(
      withSide({ kind: 'range', from: 'main', to: SHA, mode: 'two-dot' }, 'to', { kind: 'ref', name: 'feat' }),
    ).toEqual({ kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })
    expect(withSide({ kind: 'local' }, 'from', { kind: 'ref', name: 'main' })).toEqual({ kind: 'local', base: 'main' })
    expect(withSide({ kind: 'staged', base: 'main' }, 'to', { kind: 'ref', name: 'feat' })).toEqual({
      kind: 'range',
      from: 'main',
      to: 'feat',
      mode: 'merge-base',
    })
  })

  it('compares any commit with the working tree or the staged files, not only HEAD', () => {
    expect(withSide({ kind: 'local' }, 'from', { kind: 'ref', name: SHA })).toEqual({ kind: 'local', base: SHA })
    expect(withSide({ kind: 'staged' }, 'from', { kind: 'ref', name: SHA })).toEqual({ kind: 'staged', base: SHA })
    expect(withSide({ kind: 'local', base: SHA }, 'to', { kind: 'index' })).toEqual({ kind: 'staged', base: SHA })
    expect(withSide({ kind: 'local', base: SHA }, 'from', { kind: 'ref', name: 'HEAD' })).toEqual({ kind: 'local' })
    expect(describeTarget({ kind: 'local', base: SHA })).toEqual({ from: '3f2a91c', to: 'working tree', path: null })
    expect(describeTarget({ kind: 'staged', base: 'v1' })).toEqual({ from: 'v1', to: 'staged', path: null })
    // A typed sha keeps git's short length, whatever follows it.
    expect(describeTarget({ kind: 'range', from: `${SHA}^`, to: SHA, mode: 'two-dot' }).from).toBe('3f2a91c^')
    expect(describeTarget({ kind: 'local', base: `${SHA}~2` }).from).toBe('3f2a91c~2')
  })

  it('keeps the current range mode', () => {
    const target = { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' } as const
    expect(withSide(target, 'from', { kind: 'ref', name: 'v1' })).toEqual({ ...target, from: 'v1' })
  })

  it('maps the special states onto local, staged and unstaged', () => {
    const range = { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' } as const
    expect(withSide(range, 'to', { kind: 'worktree' })).toEqual({ kind: 'local', base: 'main' })
    expect(withSide(range, 'to', { kind: 'index' })).toEqual({ kind: 'staged', base: 'main' })
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
