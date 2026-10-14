import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listFiles } from '../index'

describe('listFiles, ranges and commits', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  // main: base -> main-only;  feat (from base): feat-only
  function branches() {
    repo = createRepo()
    repo.write('shared.txt', 'base\n')
    repo.commit('base')
    repo.git('switch', '-q', '-c', 'feat')
    repo.write('feat.txt', 'feature\n')
    repo.commit('feat work')
    repo.git('switch', '-q', 'main')
    repo.write('main.txt', 'main\n')
    repo.commit('main work')
  }

  it('two-dot compares the two tips directly', async () => {
    branches()
    const files = await listFiles(repo.path, { kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ['feat.txt', 'added'],
      ['main.txt', 'deleted'],
    ])
  })

  it('merge-base shows only what changed on the second branch', async () => {
    branches()
    const files = await listFiles(repo.path, { kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' })
    expect(files.map((f) => [f.path, f.status])).toEqual([['feat.txt', 'added']])
  })

  it('accepts tags and shas', async () => {
    branches()
    repo.git('tag', 'v1', 'main~1')
    const sha = repo.git('rev-parse', 'main')
    const files = await listFiles(repo.path, { kind: 'range', from: 'v1', to: sha, mode: 'two-dot' })
    expect(files.map((f) => f.path)).toEqual(['main.txt'])
  })

  it('lists a single commit against its parent', async () => {
    branches()
    const sha = repo.git('rev-parse', 'feat')
    const files = await listFiles(repo.path, { kind: 'commit', sha })
    expect(files.map((f) => [f.path, f.status, f.additions])).toEqual([['feat.txt', 'added', 1]])
  })

  it('lists a root commit against the empty tree', async () => {
    branches()
    const root = repo.git('rev-list', '--max-parents=0', 'HEAD')
    const files = await listFiles(repo.path, { kind: 'commit', sha: root })
    expect(files.map((f) => f.path)).toEqual(['shared.txt'])
  })

  it('does not include untracked files for ranges', async () => {
    branches()
    repo.write('scratch.txt', 'x\n')
    const files = await listFiles(repo.path, { kind: 'range', from: 'main~1', to: 'main', mode: 'two-dot' })
    expect(files.map((f) => f.path)).toEqual(['main.txt'])
  })

  it('rejects unknown refs', async () => {
    branches()
    await expect(
      listFiles(repo.path, { kind: 'range', from: 'main', to: 'missing', mode: 'two-dot' }),
    ).rejects.toMatchObject({ code: 'unknown-ref' })
  })
})
