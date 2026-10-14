import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreLatest, snapshot } from '../index'

describe('undo store', () => {
  let repo: TestRepo
  let cache: string
  afterEach(() => {
    repo.cleanup()
    rmSync(cache, { recursive: true, force: true })
  })

  function seed() {
    repo = createRepo()
    cache = mkdtempSync(join(tmpdir(), 'duck-diff-cache-'))
  }

  it('restores modified files and removes files that did not exist', async () => {
    seed()
    repo.write('src/a.txt', 'before\n')
    await snapshot(repo.path, ['src/a.txt', 'gone.txt'], cache)
    repo.write('src/a.txt', 'after\n')
    repo.write('gone.txt', 'created later\n')
    expect(await restoreLatest(repo.path, cache)).toEqual(['src/a.txt', 'gone.txt'])
    expect(readFileSync(join(repo.path, 'src/a.txt'), 'utf8')).toBe('before\n')
    expect(existsSync(join(repo.path, 'gone.txt'))).toBe(false)
  })

  it('restores deleted files and works newest first', async () => {
    seed()
    repo.write('a.txt', 'one\n')
    await snapshot(repo.path, ['a.txt'], cache)
    repo.write('a.txt', 'two\n')
    await snapshot(repo.path, ['a.txt'], cache)
    repo.remove('a.txt')
    await restoreLatest(repo.path, cache)
    expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('two\n')
    await restoreLatest(repo.path, cache)
    expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('one\n')
    expect(await restoreLatest(repo.path, cache)).toBeNull()
  })

  it('keeps only the last 20 snapshots', async () => {
    seed()
    repo.write('a.txt', 'x\n')
    for (let i = 0; i < 23; i++) await snapshot(repo.path, ['a.txt'], cache)
    let restored = 0
    while (await restoreLatest(repo.path, cache)) restored++
    expect(restored).toBe(20)
  })
})
