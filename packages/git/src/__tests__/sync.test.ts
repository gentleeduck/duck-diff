import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  abortOperation,
  checkoutDetached,
  cherryPick,
  commit,
  deleteBranch,
  fetchAll,
  mergeRef,
  pull,
  push,
  readSyncStatus,
  revertCommit,
  stashApply,
  stashDrop,
  stashSave,
  switchBranch,
} from '../index'

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
    expect(await readSyncStatus(repo.path)).toEqual({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: 0,
      operation: null,
    })
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

describe('stash', () => {
  it('saves with a message and untracked files, applies, pops and drops', async () => {
    withRemote()
    repo.write('a.txt', 'changed\n')
    repo.write('new.txt', 'new\n')
    await stashSave(repo.path, { message: 'wip', untracked: true })
    expect(repo.git('status', '--porcelain')).toBe('')
    expect(repo.git('stash', 'list', '--format=%gs')).toContain('wip')
    await stashApply(repo.path, { name: 'stash@{0}', pop: false })
    expect(repo.git('stash', 'list')).not.toBe('')
    repo.git('reset', '-q', '--hard')
    repo.git('clean', '-qfd')
    await stashApply(repo.path, { name: 'stash@{0}', pop: true })
    expect(repo.git('stash', 'list')).toBe('')
    expect(readFileSync(join(repo.path, 'new.txt'), 'utf8')).toBe('new\n')
    await stashSave(repo.path, { message: '', untracked: false })
    await stashDrop(repo.path, 'stash@{0}')
    expect(repo.git('stash', 'list')).toBe('')
  })
})

describe('merge, cherry-pick and revert', () => {
  // main and side both edit a.txt, so merging or picking side into main conflicts.
  function diverged() {
    withRemote()
    repo.git('switch', '-q', '-c', 'side')
    repo.write('a.txt', 'side\n')
    const sideSha = repo.commit('side edit')
    repo.git('switch', '-q', 'main')
    repo.write('a.txt', 'main\n')
    repo.commit('main edit')
    return sideSha
  }

  it('stops a conflicting merge for resolving, reports it, and aborts it', async () => {
    diverged()
    expect(await mergeRef(repo.path, 'side')).toEqual({ conflicts: true })
    expect((await readSyncStatus(repo.path)).operation).toBe('merge')
    await abortOperation(repo.path)
    expect((await readSyncStatus(repo.path)).operation).toBeNull()
    expect(repo.git('status', '--porcelain')).toBe('')
  })

  it('finishes a resolved merge with a commit even when the resolution matches HEAD', async () => {
    diverged()
    await mergeRef(repo.path, 'side')
    repo.write('a.txt', 'main\n')
    repo.git('add', 'a.txt')
    await commit(repo.path, { message: 'merge side', amend: false })
    expect(repo.git('log', '-1', '--format=%P').split(' ')).toHaveLength(2)
  })

  it('picks a clean commit, reverts it, and deletes a merged branch only when asked to force', async () => {
    withRemote()
    repo.git('switch', '-q', '-c', 'side')
    repo.write('b.txt', 'b\n')
    const sha = repo.commit('add b')
    repo.git('switch', '-q', 'main')
    expect(await cherryPick(repo.path, sha)).toEqual({ conflicts: false })
    expect(repo.git('log', '-1', '--format=%s')).toBe('add b')
    expect(await revertCommit(repo.path, 'HEAD')).toEqual({ conflicts: false })
    expect(repo.git('log', '-1', '--format=%s')).toContain('Revert')
    await expect(deleteBranch(repo.path, { name: 'side', force: false })).rejects.toThrow()
    await deleteBranch(repo.path, { name: 'side', force: true })
    expect(repo.git('branch', '--list', 'side')).toBe('')
  })
})
