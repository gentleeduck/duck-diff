import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { checkoutDetached, commit, fetchAll, pull, push, readSyncStatus, switchBranch } from '../index'

let repo: TestRepo
let remote: string
let other: TestRepo | null = null

// The library runs git with the caller's environment; CI has no identity, so the tests supply one.
beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Duck Test',
    GIT_AUTHOR_EMAIL: 'test@duck.local',
    GIT_COMMITTER_NAME: 'Duck Test',
    GIT_COMMITTER_EMAIL: 'test@duck.local',
  })
})

afterEach(() => {
  repo.cleanup()
  other?.cleanup()
  other = null
  if (remote) rmSync(remote, { recursive: true, force: true })
})

function withRemote() {
  repo = createRepo()
  repo.write('a.txt', '1\n')
  repo.commit('base')
  remote = mkdtempSync(join(tmpdir(), 'duck-diff-remote-'))
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  repo.git('remote', 'add', 'origin', remote)
}

describe('commit', () => {
  it('commits what is staged with the message, and amends', async () => {
    withRemote()
    repo.write('a.txt', '2\n')
    repo.git('add', 'a.txt')
    const sha = await commit(repo.path, { message: 'second', amend: false })
    expect(repo.git('log', '-1', '--format=%s')).toBe('second')
    expect(sha).toBe(repo.git('rev-parse', 'HEAD'))
    await commit(repo.path, { message: 'second, reworded', amend: true })
    expect(repo.git('log', '--format=%s')).toBe('second, reworded\nbase')
  })

  it('refuses to commit when nothing is staged', async () => {
    withRemote()
    await expect(commit(repo.path, { message: 'empty', amend: false })).rejects.toThrow('nothing is staged')
  })
})

describe('sync', () => {
  it('publishes a new branch, then reports ahead and behind', async () => {
    withRemote()
    expect(await readSyncStatus(repo.path)).toEqual({ branch: 'main', upstream: null, ahead: 0, behind: 0, staged: 0 })
    repo.write('a.txt', 'staged\n')
    repo.git('add', 'a.txt')
    expect((await readSyncStatus(repo.path)).staged).toBe(1)
    repo.git('reset', '-q', '--hard')
    await push(repo.path)
    expect(await readSyncStatus(repo.path)).toMatchObject({ upstream: 'origin/main', ahead: 0, behind: 0 })
    repo.write('a.txt', '2\n')
    repo.commit('local')
    expect(await readSyncStatus(repo.path)).toMatchObject({ ahead: 1, behind: 0 })
    await push(repo.path)
    expect(await readSyncStatus(repo.path)).toMatchObject({ ahead: 0 })
  })

  it('fetches and pulls what another clone pushed', async () => {
    withRemote()
    await push(repo.path)
    other = createRepo()
    other.git('remote', 'add', 'origin', remote)
    other.git('fetch', '-q', 'origin')
    other.git('reset', '-q', '--hard', 'origin/main')
    other.write('b.txt', 'from elsewhere\n')
    other.commit('elsewhere')
    other.git('push', '-q', 'origin', 'HEAD:main')
    await fetchAll(repo.path)
    expect(await readSyncStatus(repo.path)).toMatchObject({ behind: 1 })
    await pull(repo.path)
    expect(repo.git('log', '-1', '--format=%s')).toBe('elsewhere')
  })

  it('creates and switches branches, and checks out a commit', async () => {
    withRemote()
    await switchBranch(repo.path, { branch: 'feat/x', create: true })
    expect((await readSyncStatus(repo.path)).branch).toBe('feat/x')
    await switchBranch(repo.path, { branch: 'main', create: false })
    expect((await readSyncStatus(repo.path)).branch).toBe('main')
    await checkoutDetached(repo.path, 'HEAD')
    expect((await readSyncStatus(repo.path)).branch).toBeNull()
    await expect(push(repo.path)).rejects.toThrow('detached')
  })
})
