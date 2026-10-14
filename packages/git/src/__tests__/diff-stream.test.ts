import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { streamDiff } from '../index'

async function collect(source: AsyncIterable<string>) {
  let out = ''
  for await (const chunk of source) out += chunk
  return out
}

describe('streamDiff', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('streams every changed file, untracked ones last', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.write('b.txt', '2\n')
    repo.commit('base')
    repo.write('a.txt', 'one\n')
    repo.write('b.txt', 'two\n')
    repo.write('new.txt', 'fresh\n')
    const patch = await collect(streamDiff(repo.path, { kind: 'unstaged' }))
    const headers = patch.split('\n').filter((line) => line.startsWith('diff --git'))
    expect(headers).toEqual([
      'diff --git a/a.txt b/a.txt',
      'diff --git a/b.txt b/b.txt',
      'diff --git a/new.txt b/new.txt',
    ])
    expect(patch).toContain('+fresh')
  })

  it('leaves untracked files out of ranges', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    repo.write('a.txt', '2\n')
    repo.commit('next')
    repo.write('scratch.txt', 'x\n')
    const patch = await collect(streamDiff(repo.path, { kind: 'range', from: 'main~1', to: 'main', mode: 'two-dot' }))
    expect(patch).toContain('a/a.txt')
    expect(patch).not.toContain('scratch.txt')
  })

  it('yields nothing for a clean tree', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    expect(await collect(streamDiff(repo.path, { kind: 'unstaged' }))).toBe('')
  })
})
