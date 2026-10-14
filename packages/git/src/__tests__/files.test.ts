import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listFiles } from '../index'

describe('listFiles, local changes', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  function seed() {
    repo = createRepo()
    repo.write('keep.txt', 'one\ntwo\n')
    repo.write('gone.txt', 'bye\n')
    repo.write('old-name.txt', 'same content that is long enough to be detected as a rename\n')
    repo.commit('base')
  }

  it('lists unstaged modifications and deletions with counts', async () => {
    seed()
    repo.write('keep.txt', 'one\nTWO\nthree\n')
    repo.remove('gone.txt')
    const files = await listFiles(repo.path, { kind: 'unstaged' })
    expect(files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ['gone.txt', 'deleted', 0, 1],
      ['keep.txt', 'modified', 2, 1],
    ])
  })

  it('lists untracked files as untracked with their line counts', async () => {
    seed()
    repo.write('new.txt', 'a\nb\n')
    const files = await listFiles(repo.path, { kind: 'unstaged' })
    expect(files).toContainEqual(
      expect.objectContaining({ path: 'new.txt', status: 'untracked', additions: 2, deletions: 0, oldSha: null }),
    )
  })

  it('separates staged from unstaged', async () => {
    seed()
    repo.write('keep.txt', 'one\nstaged\n')
    repo.git('add', 'keep.txt')
    repo.write('keep.txt', 'one\nstaged\nunstaged\n')
    const staged = await listFiles(repo.path, { kind: 'staged' })
    const unstaged = await listFiles(repo.path, { kind: 'unstaged' })
    expect(staged.map((f) => [f.path, f.additions, f.deletions])).toEqual([['keep.txt', 1, 1]])
    expect(unstaged.map((f) => [f.path, f.additions, f.deletions])).toEqual([['keep.txt', 1, 0]])
  })

  it('detects renames in staged changes', async () => {
    seed()
    repo.git('mv', 'old-name.txt', 'new-name.txt')
    const [file] = await listFiles(repo.path, { kind: 'staged' })
    expect(file).toMatchObject({ path: 'new-name.txt', oldPath: 'old-name.txt', status: 'renamed' })
  })

  it('marks binary files', async () => {
    seed()
    repo.write('img.bin', new Uint8Array([0, 1, 2, 3, 0, 255]))
    repo.git('add', 'img.bin')
    const [file] = await listFiles(repo.path, { kind: 'staged' })
    expect(file).toMatchObject({ path: 'img.bin', binary: true, additions: null, deletions: null })
  })

  it('gives working-tree files a real content sha', async () => {
    seed()
    repo.write('keep.txt', 'changed\n')
    const [file] = await listFiles(repo.path, { kind: 'unstaged' })
    expect(file?.newSha).toBe(repo.git('hash-object', 'keep.txt'))
    expect(file?.oldSha).toBe(repo.git('rev-parse', ':keep.txt'))
  })

  it('local combines staged and unstaged against HEAD', async () => {
    seed()
    repo.write('keep.txt', 'one\nstaged\n')
    repo.git('add', 'keep.txt')
    repo.write('gone.txt', 'edited\n')
    const files = await listFiles(repo.path, { kind: 'local' })
    expect(files.map((f) => f.path)).toEqual(['gone.txt', 'keep.txt'])
  })

  it('returns an empty list for a clean tree', async () => {
    seed()
    expect(await listFiles(repo.path, { kind: 'unstaged' })).toEqual([])
  })
})
