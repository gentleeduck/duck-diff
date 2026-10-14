import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { readSide } from '../index'

describe('readSide', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  function seed() {
    repo = createRepo()
    repo.write('a.txt', 'v1\n')
    repo.commit('base')
    repo.write('a.txt', 'v2\n')
    repo.git('add', 'a.txt')
    repo.write('a.txt', 'v3\n')
  }

  it('reads index vs worktree for unstaged', async () => {
    seed()
    expect(await readSide(repo.path, { kind: 'unstaged' }, 'old', 'a.txt')).toBe('v2\n')
    expect(await readSide(repo.path, { kind: 'unstaged' }, 'new', 'a.txt')).toBe('v3\n')
  })

  it('reads HEAD vs index for staged and HEAD vs worktree for local', async () => {
    seed()
    expect(await readSide(repo.path, { kind: 'staged' }, 'old', 'a.txt')).toBe('v1\n')
    expect(await readSide(repo.path, { kind: 'staged' }, 'new', 'a.txt')).toBe('v2\n')
    expect(await readSide(repo.path, { kind: 'local' }, 'old', 'a.txt')).toBe('v1\n')
    expect(await readSide(repo.path, { kind: 'local' }, 'new', 'a.txt')).toBe('v3\n')
  })

  it('reads commit parent and commit, and ranges', async () => {
    repo = createRepo()
    repo.write('a.txt', 'v1\n')
    repo.commit('base')
    repo.git('switch', '-q', '-c', 'feat')
    repo.write('a.txt', 'feat\n')
    const sha = repo.commit('feat')
    repo.git('switch', '-q', 'main')
    repo.write('a.txt', 'main\n')
    repo.commit('main')
    expect(await readSide(repo.path, { kind: 'commit', sha }, 'old', 'a.txt')).toBe('v1\n')
    expect(await readSide(repo.path, { kind: 'commit', sha }, 'new', 'a.txt')).toBe('feat\n')
    const pr = { kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' } as const
    expect(await readSide(repo.path, pr, 'old', 'a.txt')).toBe('v1\n')
    const direct = { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' } as const
    expect(await readSide(repo.path, direct, 'old', 'a.txt')).toBe('main\n')
  })

  it('returns null when the file is absent on that side', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.commit('base')
    repo.write('new.txt', 'n\n')
    repo.remove('a.txt')
    expect(await readSide(repo.path, { kind: 'unstaged' }, 'old', 'new.txt')).toBeNull()
    expect(await readSide(repo.path, { kind: 'unstaged' }, 'new', 'a.txt')).toBeNull()
  })

  it('reads a root commit old side as absent', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    const root = repo.commit('root')
    expect(await readSide(repo.path, { kind: 'commit', sha: root }, 'old', 'a.txt')).toBeNull()
  })
  it('treats a branch named worktree as a ref, not the working tree', async () => {
    repo = createRepo()
    repo.write('a.txt', 'base\n')
    repo.commit('base')
    repo.git('branch', 'worktree')
    repo.write('a.txt', 'on disk\n')
    const range = { kind: 'range', from: 'main', to: 'worktree', mode: 'two-dot' } as const
    expect(await readSide(repo.path, range, 'new', 'a.txt')).toBe('base\n')
  })
})
