import { afterEach, describe, expect, it } from 'bun:test'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGit } from '@duck-diff/git'
import type { Job, ServerEvent } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createDiskCache } from '../disk-cache'
import { createJobs } from '../jobs'
import { type Fixture, startFixture } from './helpers'

const plain = (text: string | null) => Bun.stripANSI(text ?? '')
const flush = () => new Promise((resolve) => setTimeout(resolve, 40))

describe('jobs', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('records the commands and output of an action and publishes them in order', async () => {
    repo = createRepo()
    const events: ServerEvent[] = []
    const jobs = createJobs((event) => events.push(event))
    await jobs.run('Status', async () => {
      await runGit(['rev-parse', 'HEAD'], { cwd: repo.path, okExitCodes: [128] })
      await runGit(['commit', '--allow-empty', '-m', 'with space'], {
        cwd: repo.path,
        env: { GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@a', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@a' },
      })
    })
    await flush()
    const [job] = jobs.list()
    expect(job).toMatchObject({ title: 'Status', status: 'ok', command: "git commit --allow-empty -m 'with space'" })
    const output = plain(jobs.output(job?.id ?? ''))
    expect(output).toContain('$ git rev-parse HEAD')
    expect(output).toContain("$ git commit --allow-empty -m 'with space'")
    expect(output).toContain('with space')
    const kinds = events.map((event) => event.type)
    expect(kinds[0]).toBe('job')
    expect(kinds.at(-1)).toBe('job')
    expect(kinds).toContain('job-output')
    const last = events.at(-1) as { job: Job }
    expect(last.job.status).toBe('ok')
  })

  it('marks a failed action and keeps what the hook printed', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.git('add', 'a.txt')
    const hook = join(repo.path, '.git/hooks/pre-commit')
    repo.write('.git/hooks/pre-commit', '#!/bin/sh\necho "lint failed in a.txt" >&2\nexit 1\n')
    chmodSync(hook, 0o755)
    const jobs = createJobs(() => {})
    const run = jobs.run('Commit', () => runGit(['commit', '-m', 'x'], { cwd: repo.path }))
    await expect(run).rejects.toThrow()
    const [job] = jobs.list()
    expect(job?.status).toBe('failed')
    expect(job?.error).toContain('exited 1')
    expect(plain(jobs.output(job?.id ?? ''))).toContain('lint failed in a.txt')
  })

  it('clears the finished jobs and keeps one still running', async () => {
    repo = createRepo()
    const jobs = createJobs(() => {})
    await jobs.run('Done', () => runGit(['status'], { cwd: repo.path }))
    let finish = () => {}
    const running = jobs.run(
      'Slow',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    jobs.clear()
    expect(jobs.list().map((job) => job.title)).toEqual(['Slow'])
    finish()
    await running
  })

  it('keeps the latest jobs and the tail of long output', async () => {
    repo = createRepo()
    const jobs = createJobs(() => {}, { keep: 2, maxOutput: 100 })
    for (const title of ['one', 'two', 'three']) {
      await jobs.run(title, () =>
        runGit(['var', 'GIT_EDITOR'], { cwd: repo.path, env: { GIT_EDITOR: 'x'.repeat(300) } }),
      )
    }
    expect(jobs.list().map((job) => job.title)).toEqual(['three', 'two'])
    const output = jobs.output(jobs.list()[0]?.id ?? '') ?? ''
    expect(output.length).toBeLessThanOrEqual(100)
    expect(output).toContain('done')
  })
})

describe('jobs routes', () => {
  let fixture: Fixture
  afterEach(() => fixture.close())

  it('lists the actions run through the api with their output', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'a\n')
      repo.commit('a')
    })
    const headers = { 'x-duck-diff-token': fixture.server.token, 'content-type': 'application/json' }
    const base = `http://127.0.0.1:${fixture.server.port}`
    await fetch(`${base}/api/git/switch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ branch: 'next', create: true }),
    })
    const list = (await (await fixture.get('/api/jobs')).json()) as Job[]
    expect(list[0]).toMatchObject({ title: 'Switch', status: 'ok', command: 'git switch -c next' })
    const output = plain(await (await fixture.get(`/api/jobs/${list[0]?.id}/output`)).text())
    expect(output).toContain('$ git switch -c next')
  })
})

describe('jobs kept across a restart', () => {
  let repo: TestRepo
  let dir: string
  afterEach(() => {
    repo.cleanup()
    rmSync(dir, { recursive: true, force: true })
  })

  it('brings back the list and the tail of each output', async () => {
    repo = createRepo()
    dir = mkdtempSync(join(tmpdir(), 'duck-jobs-'))
    const cache = createDiskCache(dir)
    const jobs = createJobs(() => {}, { cache, keepOutput: 50 })
    await jobs.run('Var', () =>
      runGit(['var', 'GIT_EDITOR'], { cwd: repo.path, env: { GIT_EDITOR: `${'x'.repeat(100)}END` } }),
    )
    await cache.flush()

    const again = createJobs(() => {}, { cache: createDiskCache(dir), keepOutput: 50 })
    await again.ready
    const [job] = again.list()
    expect(job).toMatchObject({ title: 'Var', status: 'ok' })
    const output = plain(again.output(job?.id ?? ''))
    expect(output.length).toBeLessThanOrEqual(50)
    expect(output).toContain('done')
  })
})
