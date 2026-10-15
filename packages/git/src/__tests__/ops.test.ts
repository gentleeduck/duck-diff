import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  addRemote,
  blame,
  cleanUntracked,
  commit,
  continueOperation,
  createTag,
  deleteRemoteBranch,
  deleteTag,
  fetchRemote,
  forcePush,
  lastMessage,
  listRemotes,
  markResolved,
  mergeRef,
  push,
  pushTags,
  readSyncStatus,
  rebaseOnto,
  removeRemote,
  renameBranch,
  resetTo,
  resolveConflict,
  setUpstream,
  skipCommit,
  stashStaged,
  trackRemote,
  undoCommit,
} from '../index'

let repo: TestRepo
let remote = ''

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
  if (remote) rmSync(remote, { recursive: true, force: true })
  remote = ''
})

function setup() {
  repo = createRepo()
  repo.write('a.txt', '1\n')
  repo.commit('base')
}

function withRemote() {
  setup()
  remote = mkdtempSync(join(tmpdir(), 'duck-diff-ops-'))
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  repo.git('remote', 'add', 'origin', remote)
}

// main and side both edit a.txt.
function diverged() {
  repo.git('switch', '-q', '-c', 'side')
  repo.write('a.txt', 'side\n')
  repo.commit('side edit')
  repo.git('switch', '-q', 'main')
  repo.write('a.txt', 'main\n')
  repo.commit('main edit')
}

const read = (path: string) => readFileSync(join(repo.path, path), 'utf8')

describe('conflicts', () => {
  it('takes one side of a conflicted file, or marks a hand-made resolution resolved', async () => {
    setup()
    diverged()
    await mergeRef(repo.path, 'side')
    await resolveConflict(repo.path, { path: 'a.txt', side: 'theirs' })
    expect(read('a.txt')).toBe('side\n')
    expect(repo.git('diff', '--name-only', '--diff-filter=U').trim()).toBe('')
    repo.git('merge', '--abort')
    await mergeRef(repo.path, 'side')
    repo.write('a.txt', 'both\n')
    await markResolved(repo.path, 'a.txt')
    await commit(repo.path, { message: 'merge', amend: false })
    expect(read('a.txt')).toBe('both\n')
  })
})

describe('commits', () => {
  it('undoes the last commit into the index, signs off, and resets to any commit', async () => {
    setup()
    repo.write('b.txt', 'b\n')
    repo.git('add', 'b.txt')
    await commit(repo.path, { message: 'add b', amend: false, signoff: true })
    expect(await lastMessage(repo.path)).toMatch(/\n\nSigned-off-by: .+ <.+>$/)
    await undoCommit(repo.path)
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('base')
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('b.txt')
    repo.git('commit', '-q', '-m', 'again')
    await resetTo(repo.path, { sha: 'HEAD~1', mode: 'hard' })
    expect(existsSync(join(repo.path, 'b.txt'))).toBe(false)
    await expect(undoCommit(repo.path)).rejects.toThrow('first commit')
  })
})

describe('branches, tags and remotes', () => {
  it('renames, tracks, sets upstream, force-pushes and deletes remote branches', async () => {
    withRemote()
    await push(repo.path)
    repo.git('switch', '-q', '-c', 'feature')
    await push(repo.path)
    await renameBranch(repo.path, { from: 'feature', to: 'feature-2' })
    expect(repo.git('branch', '--show-current').trim()).toBe('feature-2')
    await setUpstream(repo.path, { branch: 'feature-2', upstream: 'origin/feature' })
    expect((await readSyncStatus(repo.path)).upstream).toBe('origin/feature')
    repo.git('commit', '-q', '--amend', '-m', 'rewritten')
    await forcePush(repo.path)
    expect(execFileSync('git', ['-C', remote, 'log', '-1', '--format=%s', 'feature']).toString().trim()).toBe(
      'rewritten',
    )
    repo.git('switch', '-q', 'main')
    repo.git('branch', '-q', '-D', 'feature-2')
    await trackRemote(repo.path, 'origin/feature')
    expect(repo.git('branch', '--show-current').trim()).toBe('feature')
    repo.git('switch', '-q', 'main')
    await deleteRemoteBranch(repo.path, { remote: 'origin', branch: 'feature' })
    expect(execFileSync('git', ['-C', remote, 'branch', '--list', 'feature']).toString().trim()).toBe('')
  })

  it('creates, pushes and deletes tags, plain or annotated', async () => {
    withRemote()
    await push(repo.path)
    await createTag(repo.path, { name: 'v1', sha: 'HEAD', message: '' })
    await createTag(repo.path, { name: 'v2', sha: 'HEAD', message: 'second' })
    expect(repo.git('cat-file', '-t', 'v2').trim()).toBe('tag')
    await pushTags(repo.path, { remote: 'origin', name: 'v1' })
    expect(execFileSync('git', ['-C', remote, 'tag']).toString().trim()).toBe('v1')
    await pushTags(repo.path, { remote: 'origin', name: null })
    expect(execFileSync('git', ['-C', remote, 'tag']).toString().trim().split('\n')).toEqual(['v1', 'v2'])
    await deleteTag(repo.path, 'v1')
    expect(repo.git('tag').trim()).toBe('v2')
  })

  it('lists, adds, fetches and removes remotes', async () => {
    withRemote()
    await addRemote(repo.path, { name: 'mirror', url: remote })
    expect(await listRemotes(repo.path)).toEqual([
      { name: 'mirror', url: remote },
      { name: 'origin', url: remote },
    ])
    await fetchRemote(repo.path, { remote: 'mirror', prune: true })
    await removeRemote(repo.path, 'mirror')
    expect((await listRemotes(repo.path)).map((entry) => entry.name)).toEqual(['origin'])
  })
})

describe('rebase, clean, stash and blame', () => {
  it('stops a rebase on conflicts, continues after a resolution, and skips', async () => {
    setup()
    diverged()
    repo.git('switch', '-q', 'side')
    expect(await rebaseOnto(repo.path, 'main')).toEqual({ conflicts: true })
    expect((await readSyncStatus(repo.path)).operation).toBe('rebase')
    repo.write('a.txt', 'resolved\n')
    repo.git('add', 'a.txt')
    expect(await continueOperation(repo.path)).toEqual({ conflicts: false })
    expect((await readSyncStatus(repo.path)).operation).toBeNull()
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('side edit')

    repo.git('reset', '-q', '--hard', 'main~1')
    repo.write('a.txt', 'again\n')
    repo.commit('again')
    await rebaseOnto(repo.path, 'main')
    expect(await skipCommit(repo.path)).toEqual({ conflicts: false })
    expect(repo.git('rev-parse', 'HEAD').trim()).toBe(repo.git('rev-parse', 'main').trim())
  })

  it('cleans untracked files, stashes only what is staged, and blames each line', async () => {
    setup()
    repo.write('stray/x.txt', 'x\n')
    await cleanUntracked(repo.path)
    expect(existsSync(join(repo.path, 'stray'))).toBe(false)

    repo.write('a.txt', '1\n2\n')
    repo.git('add', 'a.txt')
    repo.write('b.txt', 'unstaged\n')
    repo.git('add', '-N', 'b.txt')
    await stashStaged(repo.path, 'only staged')
    expect(repo.git('stash', 'list', '--format=%gs').trim()).toContain('only staged')
    expect(read('a.txt')).toBe('1\n')
    repo.git('stash', 'pop', '-q')
    repo.git('add', '-A')
    repo.git('commit', '-q', '-m', 'second line')

    const lines = await blame(repo.path, 'a.txt')
    expect(lines.map((line) => line.summary)).toEqual(['base', 'second line'])
    expect(lines[0]?.author).toBe('Duck Test')
  })
})
