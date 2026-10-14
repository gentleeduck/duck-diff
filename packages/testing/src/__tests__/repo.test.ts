import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRepo, type TestRepo } from '../index'

describe('createRepo', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('creates an empty repo on main', () => {
    repo = createRepo()
    expect(existsSync(join(repo.path, '.git'))).toBe(true)
    expect(repo.git('symbolic-ref', '--short', 'HEAD')).toBe('main')
  })

  it('writes files and commits them, returning the sha', () => {
    repo = createRepo()
    repo.write('src/a.txt', 'hello\n')
    const sha = repo.commit('first')
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(repo.git('show', '--name-only', '--format=', sha)).toBe('src/a.txt')
  })

  it('removes files', () => {
    repo = createRepo()
    repo.write('a.txt', 'x\n')
    repo.commit('add')
    repo.remove('a.txt')
    expect(repo.git('status', '--porcelain')).toBe(' D a.txt')
  })

  it('cleanup deletes the directory', () => {
    repo = createRepo()
    const path = repo.path
    repo.cleanup()
    expect(existsSync(path)).toBe(false)
    repo = { ...repo, cleanup: () => {} }
  })
})
