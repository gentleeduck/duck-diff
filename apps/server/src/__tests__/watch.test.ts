import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { classifyPath, watchRepo } from '../watch'

describe('classifyPath', () => {
  it.each([
    ['src/a.ts', 'worktree'],
    ['.git/index', 'index'],
    ['.git/HEAD', 'refs'],
    ['.git/refs/heads/main', 'refs'],
    ['.git/packed-refs', 'refs'],
    ['.git/objects/ab/cdef', null],
    ['.git/logs/HEAD', null],
    ['.git/index.lock', null],
    ['node_modules/x/index.js', null],
    ['apps/web/node_modules/y', null],
  ])('%s -> %s', (path, expected) => {
    expect(classifyPath(path)).toBe(expected as ReturnType<typeof classifyPath>)
  })
})

describe('watchRepo', () => {
  let repo: TestRepo
  let stop = () => {}
  afterEach(() => {
    stop()
    repo.cleanup()
  })

  // macOS FSEvents can replay writes made just before the watch started, so wait for the reason
  // under test instead of taking the first event.
  function changeOf(expected: string): Promise<string> {
    return new Promise((resolve) => {
      stop = watchRepo(
        repo.path,
        (reason) => {
          if (reason === expected) resolve(reason)
        },
        50,
      )
    })
  }

  it('reports worktree edits once per burst', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    const reasons: string[] = []
    stop = watchRepo(repo.path, (reason) => reasons.push(reason), 50)
    repo.write('a.txt', '2\n')
    repo.write('b.txt', '3\n')
    await Bun.sleep(300)
    expect(reasons).toEqual(['worktree'])
  })

  it('reports index changes from git add', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    repo.write('a.txt', '2\n')
    const change = changeOf('index')
    await Bun.sleep(100)
    repo.git('add', 'a.txt')
    expect(await change).toBe('index')
  })

  it('reports ref changes from a commit', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    const change = changeOf('refs')
    await Bun.sleep(100)
    repo.git('commit', '-q', '--allow-empty', '-m', 'empty')
    expect(await change).toBe('refs')
  })
})
