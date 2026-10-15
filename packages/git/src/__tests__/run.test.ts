import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { GitError, runGit, streamGit } from '../index'

describe('runGit', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('returns stdout', async () => {
    repo = createRepo()
    expect(await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.path })).toBe('true\n')
  })

  it('throws not-a-repo outside a repository', async () => {
    repo = createRepo()
    const outside = repo.path.replace(/[^/]+$/, '')
    await expect(runGit(['status'], { cwd: outside })).rejects.toMatchObject({ code: 'not-a-repo' })
  })

  it('throws unknown-ref for a bad revision', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.commit('a')
    const error = await runGit(['diff', 'nope..HEAD'], { cwd: repo.path }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('unknown-ref')
  })

  it('accepts listed non-zero exit codes', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    const out = await runGit(['diff', '--no-index', '--', '/dev/null', 'a.txt'], { cwd: repo.path, okExitCodes: [1] })
    expect(out).toContain('+a')
  })

  it('times out', async () => {
    repo = createRepo()
    const error = await runGit(['cat-file', '--batch'], { cwd: repo.path, timeoutMs: 50, holdStdin: true }).catch(
      (e: unknown) => e,
    )
    expect((error as GitError).code).toBe('timeout')
  })
})

describe('streamGit', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('yields stdout in chunks that join to the full output', async () => {
    repo = createRepo()
    repo.write('a.txt', `${'line\n'.repeat(20_000)}`)
    repo.commit('big')
    let out = ''
    for await (const chunk of streamGit(['show', 'HEAD:a.txt'], { cwd: repo.path })) out += chunk
    expect(out.length).toBe('line\n'.length * 20_000)
  })

  it('stops git quietly when the reader leaves early', async () => {
    repo = createRepo()
    repo.write('a.txt', `${'line\n'.repeat(200_000)}`)
    repo.commit('big')
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    for await (const chunk of streamGit(['show', 'HEAD:a.txt'], { cwd: repo.path })) {
      expect(chunk.length).toBeGreaterThan(0)
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    process.off('unhandledRejection', onUnhandled)
    expect(unhandled).toEqual([])
  })
})
