import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listRefs } from '../index'

describe('listRefs', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('lists branches and tags and marks the current branch', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.commit('a')
    repo.git('branch', 'feat')
    repo.git('tag', 'v1')
    const refs = await listRefs(repo.path)
    expect(refs.map((r) => [r.name, r.kind, r.current]).sort()).toEqual([
      ['feat', 'branch', false],
      ['main', 'branch', true],
      ['v1', 'tag', false],
    ])
    expect(refs.every((r) => /^[0-9a-f]{40}$/.test(r.sha))).toBe(true)
  })
})
