import { afterEach, describe, expect, it } from 'bun:test'
import { GitError, runGit, streamGit, withOutput } from '@duck-diff/git'
import { createRepo, type TestRepo } from '@duck-diff/testing'

// The git package's own tests run under Node; these run its Bun.spawn path, the one the server uses.
let repo: TestRepo
afterEach(() => repo?.cleanup())

describe('git under Bun', () => {
  it('returns stdout and writes input to stdin', async () => {
    repo = createRepo()
    expect(await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.path })).toBe('true\n')
    const sha = await runGit(['hash-object', '--stdin'], { cwd: repo.path, input: 'hello\n' })
    expect(sha.trim()).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })

  it('keeps a character split across two chunks whole', async () => {
    repo = createRepo()
    repo.write('a.txt', `${'é'.repeat(100_000)}\n`)
    repo.commit('wide')
    expect(await runGit(['show', 'HEAD:a.txt'], { cwd: repo.path })).toBe(`${'é'.repeat(100_000)}\n`)
  })

  it('says why git failed, and when it never started', async () => {
    repo = createRepo()
    await expect(runGit(['rev-parse', '--verify', 'nope'], { cwd: repo.path })).rejects.toBeInstanceOf(GitError)
    await expect(runGit(['status'], { cwd: `${repo.path}/missing` })).rejects.toBeInstanceOf(GitError)
  })

  it('times out', async () => {
    repo = createRepo()
    const error = await runGit(['cat-file', '--batch'], { cwd: repo.path, timeoutMs: 50, holdStdin: true }).catch(
      (e: unknown) => e,
    )
    expect((error as GitError).code).toBe('timeout')
  })

  it('streams the whole output, and stops git quietly when the reader leaves early', async () => {
    repo = createRepo()
    repo.write('a.txt', 'line\n'.repeat(200_000))
    repo.commit('big')
    let out = ''
    for await (const chunk of streamGit(['show', 'HEAD:a.txt'], { cwd: repo.path })) out += chunk
    expect(out.length).toBe('line\n'.length * 200_000)
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    for await (const chunk of streamGit(['show', 'HEAD:a.txt'], { cwd: repo.path })) {
      expect(chunk.length).toBeGreaterThan(0)
      break
    }
    await Bun.sleep(200)
    process.off('unhandledRejection', onUnhandled)
    expect(unhandled).toEqual([])
  })

  it('reports porcelain output to the sink and leaves plumbing out', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    let output = ''
    const sink = { command: () => {}, output: (chunk: string) => (output += chunk) }
    await withOutput(sink, () => runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.path }))
    expect(output).toBe('')
    await withOutput(sink, () => runGit(['add', '--verbose', 'a.txt'], { cwd: repo.path }))
    expect(output).toContain("add 'a.txt'")
  })
})
