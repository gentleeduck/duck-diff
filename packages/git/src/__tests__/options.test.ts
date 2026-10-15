import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteRemoteBranch, fetchRemote, GitError, pushTags, runGit } from '../index'

let repo: TestRepo
afterEach(() => repo.cleanup())

describe('values that read as git options', () => {
  it('refuses a remote or branch name that starts with a dash before git sees it', async () => {
    repo = createRepo()
    repo.commit('base')
    const marker = join(repo.path, 'ran')
    const evil = `--upload-pack=touch ${marker}`
    await expect(fetchRemote(repo.path, { remote: evil, prune: false })).rejects.toBeInstanceOf(GitError)
    await expect(deleteRemoteBranch(repo.path, { remote: evil, branch: 'main' })).rejects.toBeInstanceOf(GitError)
    await expect(deleteRemoteBranch(repo.path, { remote: 'origin', branch: '--all' })).rejects.toBeInstanceOf(GitError)
    await expect(pushTags(repo.path, { remote: evil, name: null })).rejects.toBeInstanceOf(GitError)
    expect(existsSync(marker)).toBe(false)
  })

  it('never passes an option that makes git run another program', async () => {
    repo = createRepo()
    const marker = join(repo.path, 'ran')
    for (const option of [`--upload-pack=touch ${marker}`, `--receive-pack=touch ${marker}`, '--exec=sh'])
      await expect(runGit(['fetch', option, 'origin'], { cwd: repo.path })).rejects.toThrow(/refused/)
    expect(existsSync(marker)).toBe(false)
  })
})
