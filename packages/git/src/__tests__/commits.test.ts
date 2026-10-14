import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listCommits } from '../index'

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

  it('lists all history without a base, respecting the limit', async () => {
    history()
    expect((await listCommits(repo.path, { head: 'feat' })).length).toBe(3)
    expect((await listCommits(repo.path, { head: 'feat', limit: 1 })).length).toBe(1)
  })

  it('returns an empty list when head has nothing new', async () => {
    history()
    expect(await listCommits(repo.path, { base: 'feat', head: 'main' })).toEqual([])
  })
})
