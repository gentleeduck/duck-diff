import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { readCheckout } from '../checkout'

describe('readCheckout', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('says the branch, the commit it is on and how many files differ, untracked ones too', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first commit')
    repo.write('a.txt', 'two\n')
    repo.write('new.txt', 'fresh\n')
    const info = await readCheckout(repo.path)
    expect(info.branch).toBe('main')
    expect(info.head?.subject).toBe('first commit')
    expect(info.head?.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(info.changes).toBe(2)
    expect(info.upstream).toBeNull()
  })

  it('reads a repo with no commits yet', async () => {
    repo = createRepo()
    expect((await readCheckout(repo.path)).head).toBeNull()
  })
})
