import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { targetArgs } from '../index'

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

describe('targetArgs', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('maps local targets', async () => {
    repo = createRepo()
    expect(await targetArgs(repo.path, { kind: 'unstaged' })).toEqual([])
    expect(await targetArgs(repo.path, { kind: 'staged' })).toEqual(['--cached'])
    expect(await targetArgs(repo.path, { kind: 'local' })).toEqual(['4b825dc642cb6eb9a060e54bf8d69288fbee4904'])
    repo.commit('first')
    expect(await targetArgs(repo.path, { kind: 'local' })).toEqual(['HEAD'])
  })

  it('compares the working tree or the index with any commit when given one', async () => {
    repo = createRepo()
    expect(await targetArgs(repo.path, { kind: 'local', base: 'v1' })).toEqual(['v1'])
    expect(await targetArgs(repo.path, { kind: 'staged', base: 'v1' })).toEqual(['--cached', 'v1'])
  })

  it('maps ranges', async () => {
    repo = createRepo()
    expect(await targetArgs(repo.path, { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })).toEqual([
      'main',
      'feat',
    ])
    expect(await targetArgs(repo.path, { kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' })).toEqual([
      'main...feat',
    ])
  })

  it('maps a commit to its first parent, or the empty tree for a root commit', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    const root = repo.commit('root')
    repo.write('a.txt', 'b\n')
    const second = repo.commit('second')
    expect(await targetArgs(repo.path, { kind: 'commit', sha: second })).toEqual([`${second}^1`, second])
    expect(await targetArgs(repo.path, { kind: 'commit', sha: root })).toEqual([EMPTY_TREE, root])
  })
})
