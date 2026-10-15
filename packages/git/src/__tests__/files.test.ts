import { createHash } from 'node:crypto'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listFiles, parseDiffSummary } from '../index'

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

describe('parseDiffSummary', () => {
  it('splits one --raw --numstat -z output into both halves, renames included', () => {
    const output = [
      ':100644 100644 aaa bbb M',
      'a.ts',
      ':100644 100644 ccc ddd R090',
      'old.ts',
      'new.ts',
      '3\t1\ta.ts',
      '2\t2\t',
      'old.ts',
      'new.ts',
      '-\t-\timage.png',
      '',
    ].join('\0')
    const { raw, numstat } = parseDiffSummary(output)
    expect(raw.map((entry) => [entry.path, entry.oldPath, entry.status])).toEqual([
      ['a.ts', null, 'modified'],
      ['new.ts', 'old.ts', 'renamed'],
    ])
    expect(numstat).toEqual([
      { path: 'a.ts', additions: 3, deletions: 1 },
      { path: 'new.ts', additions: 2, deletions: 2 },
      { path: 'image.png', additions: null, deletions: null },
    ])
  })
})

describe('symlinks in the working tree', () => {
  let linked: TestRepo
  afterEach(() => linked.cleanup())

  it('lists an untracked link to a folder instead of failing the whole list', async () => {
    linked = createRepo()
    linked.write('a.txt', 'a\n')
    linked.commit('a')
    linked.write('real/x.txt', 'x\n')
    linked.git('add', 'real')
    linked.git('commit', '-q', '-m', 'real')
    symlinkSync('real', join(linked.path, 'link'))
    const files = await listFiles(linked.path, { kind: 'local' })
    const link = files.find((file) => file.path === 'link')
    expect(link?.status).toBe('untracked')
    // git stores a link as its target text, so its sha is that text's blob.
    expect(link?.newSha).toBe(createHash('sha1').update('blob 4\0real').digest('hex'))
  })
})
