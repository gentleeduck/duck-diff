import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRepo } from '../index'

describe('resolveRepo', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('returns the repo root from a nested directory', async () => {
    repo = createRepo()
    mkdirSync(join(repo.path, 'a/b'), { recursive: true })
    expect(await resolveRepo(join(repo.path, 'a/b'))).toBe(repo.git('rev-parse', '--show-toplevel'))
  })

  it('rejects with not-a-repo outside git', async () => {
    repo = createRepo()
    await expect(resolveRepo('/')).rejects.toMatchObject({ code: 'not-a-repo' })
  })
})
