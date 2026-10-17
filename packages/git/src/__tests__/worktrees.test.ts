import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  addWorktree,
  listFiles,
  listSubmodules,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
  submoduleLog,
  updateSubmodules,
} from '../index'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean()
})
beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Duck Test',
    GIT_AUTHOR_EMAIL: 'test@duck.local',
    GIT_COMMITTER_NAME: 'Duck Test',
    GIT_COMMITTER_EMAIL: 'test@duck.local',
    // Local submodule clones over file paths.
    GIT_ALLOW_PROTOCOL: 'file',
  })
})

function repoWithCommit(): TestRepo {
  const repo = createRepo()
  cleanups.push(() => repo.cleanup())
  repo.write('a.txt', 'a\n')
  repo.commit('base')
  return repo
}

function freshDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'duck-diff-wt-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'tree')
}

describe('worktrees', () => {
  it('also finds checkouts kept in the worktree folders that git does not list, such as a synced copy', async () => {
    const repo = repoWithCommit()
    const copy = join(repo.path, '.claude', 'worktrees', 'copy')
    mkdirSync(copy, { recursive: true })
    execFileSync('git', ['init', '-q', '-b', 'copy-branch'], { cwd: copy })
    writeFileSync(join(copy, 'b.txt'), 'b\n')
    execFileSync('git', ['add', '.'], { cwd: copy })
    execFileSync('git', ['commit', '-qm', 'copy'], { cwd: copy })
    const real = join(repo.path, '.claude', 'worktrees', 'real')
    await addWorktree(repo.path, { path: real, branch: 'real', create: true })
    mkdirSync(join(repo.path, '.claude', 'worktrees', 'plain'))

    const listed = await listWorktrees(repo.path)
    expect(listed.map((tree) => [tree.branch, tree.separate])).toEqual([
      ['main', false],
      ['real', false],
      ['copy-branch', true],
    ])
    expect(listed[2]).toMatchObject({ path: copy, main: false, current: false })
    expect(listed[2]?.head).toMatch(/^[0-9a-f]{40}$/)
  })

  it('adds one on a new branch, lists it, removes it and prunes', async () => {
    const repo = repoWithCommit()
    const path = freshDir()
    await addWorktree(repo.path, { path, branch: 'feature', create: true })
    const listed = await listWorktrees(repo.path)
    expect(listed.map((tree) => tree.branch)).toEqual(['main', 'feature'])
    expect(listed[0]).toMatchObject({ main: true, current: true })
    expect(listed[1]).toMatchObject({ path, main: false, current: false, locked: false })
    await removeWorktree(repo.path, { path, force: false })
    expect((await listWorktrees(repo.path)).length).toBe(1)
    expect(existsSync(path)).toBe(false)
    await pruneWorktrees(repo.path)
  })

  it('checks out an existing branch and refuses one already out', async () => {
    const repo = repoWithCommit()
    repo.git('branch', 'other')
    await addWorktree(repo.path, { path: freshDir(), branch: 'other', create: false })
    await expect(addWorktree(repo.path, { path: freshDir(), branch: 'other', create: false })).rejects.toThrow()
  })
})

function withSubmodule(): { repo: TestRepo; lib: TestRepo; first: string; second: string; third: string } {
  const lib = createRepo()
  cleanups.push(() => lib.cleanup())
  lib.write('lib.txt', '1\n')
  const first = lib.commit('lib one')
  const repo = repoWithCommit()
  repo.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib.path, 'vendor/lib')
  repo.commit('add lib')
  lib.write('lib.txt', '2\n')
  const second = lib.commit('lib two')
  lib.write('lib.txt', '3\n')
  const third = lib.commit('lib three')
  return { repo, lib, first, second, third }
}

describe('submodules', () => {
  it('lists submodules with the commit recorded and the one checked out', async () => {
    const { repo, first } = withSubmodule()
    expect(await listSubmodules(repo.path)).toEqual([
      {
        path: 'vendor/lib',
        recorded: first,
        current: first,
        initialized: true,
        url: expect.stringContaining('duck-diff-'),
      },
    ])
  })

  it('marks a moved pointer as a submodule change with both commits, and lists the log between', async () => {
    const { repo, first, third } = withSubmodule()
    repo.git('-C', 'vendor/lib', 'pull', '-q', 'origin', 'main')
    const [changed] = await listFiles(repo.path, { kind: 'unstaged' })
    expect(changed).toMatchObject({ path: 'vendor/lib', submodule: true, oldSha: first, newSha: third })
    const log = await submoduleLog(repo.path, 'vendor/lib', first, third)
    expect(log.map((commit) => commit.subject)).toEqual(['lib three', 'lib two'])
  })

  it('updates a submodule back to its recorded commit', async () => {
    const { repo, first } = withSubmodule()
    repo.git('-C', 'vendor/lib', 'pull', '-q', 'origin', 'main')
    await updateSubmodules(repo.path, { path: 'vendor/lib', init: true })
    expect(repo.git('-C', 'vendor/lib', 'rev-parse', 'HEAD')).toBe(first)
  })
})
