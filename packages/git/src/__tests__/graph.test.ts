import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { graphTips, streamGraph } from '../index'

let repo: TestRepo
afterEach(() => repo.cleanup())

async function records(stream: AsyncIterable<string>) {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => record.split('\x1f'))
}

describe('streamGraph', () => {
  it('draws nothing for a repo with no commits yet, from HEAD or every branch', async () => {
    repo = createRepo()
    expect(await records(streamGraph(repo.path, { all: false, limit: 50 }))).toEqual([])
    expect(await records(streamGraph(repo.path, { all: true, limit: 50 }))).toEqual([])
  })

  it('lists every branch newest first with parents and ref names', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    repo.git('switch', '-q', '-c', 'feat')
    repo.write('b.txt', '1\n')
    repo.commit('feature')
    repo.git('switch', '-q', 'main')
    repo.git('merge', '-q', '--no-ff', '-m', 'merge feat', 'feat')
    const rows = await records(streamGraph(repo.path, { all: true, limit: 100 }))
    expect(rows.map((row) => row[6])).toEqual(['merge feat', 'feature', 'base'])
    expect(rows[0]?.[1]?.split(' ')).toHaveLength(2)
    expect(rows[0]?.[2]).toContain('HEAD -> main')
    expect(rows[1]?.[2]).toContain('feat')
  })

  it('names refs short even when the user config decorates them in full', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    repo.git('config', 'log.decorate', 'full')
    const [row] = await records(streamGraph(repo.path, { all: true, limit: 1 }))
    expect(row?.[2]).toBe('HEAD -> main')
  })

  it('respects the limit and HEAD-only mode', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('one')
    repo.git('switch', '-q', '-c', 'side')
    repo.commit('side work')
    repo.git('switch', '-q', 'main')
    repo.commit('two')
    expect((await records(streamGraph(repo.path, { all: false, limit: 100 }))).map((row) => row[6])).toEqual([
      'two',
      'one',
    ])
    expect(await records(streamGraph(repo.path, { all: true, limit: 1 }))).toHaveLength(1)
  })
})

describe('graphTips', () => {
  it('changes when any ref or HEAD moves, and only then', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    const first = await graphTips(repo.path, true)
    expect(await graphTips(repo.path, true)).toBe(first)
    repo.git('branch', 'side')
    const branched = await graphTips(repo.path, true)
    expect(branched).not.toBe(first)
    expect(await graphTips(repo.path, false)).toBe(await graphTips(repo.path, false))
    repo.write('a.txt', '2\n')
    repo.commit('next')
    expect(await graphTips(repo.path, true)).not.toBe(branched)
  })
})
