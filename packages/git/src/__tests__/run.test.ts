import { execFileSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitError, runGit, streamGit, withOutput } from '../index'

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

  it('waits as long as git keeps printing, however long that takes', async () => {
    repo = createRepo()
    const ticks = 'for i in 1 2 3 4 5 6; do echo tick; sleep 0.05; done'
    const out = await runGit(['-c', `alias.ticks=!${ticks}`, 'ticks'], { cwd: repo.path, timeoutMs: 150 })
    expect(out.trim().split('\n')).toHaveLength(6)
  })

  it('gives a command that runs hooks minutes of quiet', async () => {
    repo = createRepo()
    const hook = join(repo.path, '.git', 'hooks', 'pre-commit')
    writeFileSync(hook, '#!/bin/sh\nsleep 0.3\n')
    chmodSync(hook, 0o755)
    repo.write('a.txt', 'a\n')
    repo.git('add', 'a.txt')
    await runGit(['commit', '-q', '-m', 'quiet hook'], { cwd: repo.path, timeoutMs: 100 })
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('quiet hook')
  })

  it('stops a silent command with everything it started, at once', async () => {
    repo = createRepo()
    const started = Date.now()
    const error = await runGit(['-c', 'alias.hang=!sleep 30', 'hang'], { cwd: repo.path, timeoutMs: 100 }).catch(
      (e: unknown) => e,
    )
    expect((error as GitError).code).toBe('timeout')
    expect((error as GitError).message).toContain('git hang printed nothing')
    // The sleep held git's pipes; left running, the failure would wait for it.
    expect(Date.now() - started).toBeLessThan(5000)
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

describe('withOutput', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('reports each command and the output of git and its hooks to the sink', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.git('add', 'a.txt')
    repo.write('.git/hooks/pre-commit', '#!/bin/sh\necho "hook ran color=$FORCE_COLOR"\necho "to stderr" >&2\n')
    execFileSync('chmod', ['+x', `${repo.path}/.git/hooks/pre-commit`])
    const commands: string[][] = []
    let output = ''
    await withOutput({ command: (args) => commands.push(args), output: (chunk) => (output += chunk) }, () =>
      runGit(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'x'], { cwd: repo.path }),
    )
    expect(commands).toEqual([['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'x']])
    expect(output).toContain('hook ran color=1')
    expect(output).toContain('to stderr')
  })

  it('reports nothing outside a sink and keeps returning stdout', async () => {
    repo = createRepo()
    const sink = { command: vi.fn(), output: vi.fn() }
    await withOutput(sink, async () => {})
    expect(await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.path })).toBe('true\n')
    expect(sink.command).not.toHaveBeenCalled()
  })

  it('leaves out the stdout of plumbing reads, which only the code parses', async () => {
    repo = createRepo()
    let output = ''
    const out = await withOutput({ command: () => {}, output: (chunk) => (output += chunk) }, () =>
      runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.path }),
    )
    expect(out).toBe('true\n')
    expect(output).toBe('')
  })
})
