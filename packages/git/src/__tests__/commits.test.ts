import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listCommits, readCommit } from '../index'

describe('listCommits', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  function history() {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('first')
    repo.git('switch', '-q', '-c', 'feat')
    repo.write('a.txt', '2\n')
    repo.commit('feat: second')
    repo.write('a.txt', '3\n')
    repo.commit('feat: third | with a pipe')
  }

  it('lists commits on head that are not on base, newest first', async () => {
    history()
    const commits = await listCommits(repo.path, { base: 'main', head: 'feat' })
    expect(commits.map((c) => c.subject)).toEqual(['feat: third | with a pipe', 'feat: second'])
    expect(commits[0]).toMatchObject({ authorName: 'Duck Test', authorEmail: 'test@duck.local' })
    expect(commits[0]?.parents).toEqual([commits[1]?.sha])
  })

  it('lists nothing for a repo with no commits yet, and still rejects a bad ref', async () => {
    repo = createRepo()
    expect(await listCommits(repo.path, { head: 'HEAD', limit: 50 })).toEqual([])
    await expect(listCommits(repo.path, { head: 'nope' })).rejects.toThrow()
  })

  it('lists all history without a base, respecting the limit', async () => {
    history()
    expect((await listCommits(repo.path, { head: 'feat' })).length).toBe(3)
    expect((await listCommits(repo.path, { head: 'feat', limit: 1 })).length).toBe(1)
  })

  it('finds commits by their message, whatever the case, reading the text as it is', async () => {
    history()
    const found = await listCommits(repo.path, { head: 'feat', grep: 'THIRD | with' })
    expect(found.map((c) => c.subject)).toEqual(['feat: third | with a pipe'])
    expect(await listCommits(repo.path, { head: 'feat', grep: 'nothing like it' })).toEqual([])
  })

  it('resolves any ref git understands, such as a parent', async () => {
    history()
    const [parent] = await listCommits(repo.path, { head: 'feat^', limit: 1 })
    expect(parent?.subject).toBe('feat: second')
  })

  it('returns an empty list when head has nothing new', async () => {
    history()
    expect(await listCommits(repo.path, { base: 'feat', head: 'main' })).toEqual([])
  })
})

describe('readCommit', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('reads the full message and both identities', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.git('add', 'a.txt')
    repo.git('commit', '-q', '-m', 'subject line', '-m', 'body with | pipes\nand lines')
    const details = await readCommit(repo.path, 'HEAD')
    expect(details).toMatchObject({ authorName: 'Duck Test', committerName: 'Duck Test', parents: [] })
    expect(details.message).toBe('subject line\n\nbody with | pipes\nand lines')
  })
})

describe('readCommitStat', () => {
  it('counts files and lines in one go, for root, plain and merge commits', async () => {
    const { readCommitStat } = await import('../index')
    const local = createRepo()
    try {
      local.write('a.txt', 'one\ntwo\n')
      const root = local.commit('root')
      local.write('a.txt', 'one\nTWO\nthree\n')
      local.write('b.txt', 'b\n')
      const plain = local.commit('plain')
      local.git('checkout', '-q', '-b', 'side', root)
      local.write('c.txt', 'c\nc\n')
      local.commit('side')
      local.git('checkout', '-q', 'main')
      local.git('merge', '-q', '--no-ff', '-m', 'merge', 'side')
      const merge = local.git('rev-parse', 'HEAD')
      expect(await readCommitStat(local.path, root)).toEqual({ files: 1, additions: 2, deletions: 0 })
      expect(await readCommitStat(local.path, plain)).toEqual({ files: 2, additions: 3, deletions: 1 })
      // A merge counts what it brought into the first parent.
      expect(await readCommitStat(local.path, merge)).toEqual({ files: 1, additions: 2, deletions: 0 })
    } finally {
      local.cleanup()
    }
  })
})
