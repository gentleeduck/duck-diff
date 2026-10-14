import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listCommits, listFiles, listRefs, streamDiff } from '../index'

let repo: TestRepo
afterEach(() => repo.cleanup())

async function text(stream: AsyncIterable<string>) {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
}

function twoFiles() {
  repo = createRepo()
  repo.write('a.txt', 'a1\n')
  repo.write('b.txt', 'b1\n')
  repo.commit('first')
  repo.write('a.txt', 'a2\n')
  repo.write('b.txt', 'b2\n')
  repo.commit('second')
  return repo.git('rev-parse', 'HEAD')
}

describe('path-filtered targets', () => {
  it('limits a commit to one file', async () => {
    const sha = twoFiles()
    const files = await listFiles(repo.path, { kind: 'commit', sha, path: 'a.txt' })
    expect(files.map((file) => file.path)).toEqual(['a.txt'])
    const patch = await text(streamDiff(repo.path, { kind: 'commit', sha, path: 'a.txt' }))
    expect(patch).toContain('+a2')
    expect(patch).not.toContain('b.txt')
  })

  it('limits a range to one file', async () => {
    twoFiles()
    const target = { kind: 'range', from: 'HEAD~1', to: 'HEAD', mode: 'two-dot', path: 'b.txt' } as const
    expect((await listFiles(repo.path, target)).map((file) => file.path)).toEqual(['b.txt'])
  })
})

describe('file log', () => {
  it('lists only the commits that touched the file and follows a rename', async () => {
    twoFiles()
    repo.write('b.txt', 'b3\n')
    repo.commit('third only b')
    repo.git('mv', 'a.txt', 'renamed.txt')
    repo.commit('rename a')
    const subjects = (await listCommits(repo.path, { head: 'HEAD', path: 'renamed.txt' })).map((c) => c.subject)
    expect(subjects).toEqual(['rename a', 'second', 'first'])
  })
})

describe('stashes', () => {
  it('lists stashes as refs with their message, newest first', async () => {
    twoFiles()
    repo.write('a.txt', 'wip one\n')
    repo.git('stash', 'push', '-q', '-m', 'first try')
    repo.write('b.txt', 'wip two\n')
    repo.git('stash', 'push', '-q', '-m', 'second try')
    const stashes = (await listRefs(repo.path)).filter((ref) => ref.kind === 'stash')
    expect(stashes.map((ref) => [ref.name, ref.subject])).toEqual([
      ['stash@{0}', 'On main: second try'],
      ['stash@{1}', 'On main: first try'],
    ])
    expect(stashes[0]?.sha).toBe(repo.git('rev-parse', 'stash@{0}'))
  })

  it('answers no stashes in a repo without any', async () => {
    twoFiles()
    expect((await listRefs(repo.path)).some((ref) => ref.kind === 'stash')).toBe(false)
  })
})
