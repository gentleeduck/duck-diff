import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createDiskCache } from '../disk-cache'
import { createGitHub } from '../github'

const user = { login: 'octo', avatar_url: 'https://a/octo.png' }
const pull = {
  number: 7,
  title: 'Add things',
  state: 'open',
  merged_at: null,
  draft: false,
  user,
  head: { ref: 'feat', sha: 'h1' },
  base: { ref: 'main', sha: 'b1' },
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
  labels: [],
  html_url: 'https://github.com/o/r/pull/7',
}

describe('GitHub answers kept on disk', () => {
  let repo: TestRepo
  let dir: string
  afterEach(() => {
    repo.cleanup()
    rmSync(dir, { recursive: true, force: true })
  })

  it('asks again with the saved ETag after a restart, and answers from disk when GitHub is out of reach', async () => {
    repo = createRepo()
    repo.git('remote', 'add', 'origin', 'git@github.com:o/r.git')
    dir = mkdtempSync(join(tmpdir(), 'duck-gh-cache-'))
    const asked: (string | null)[] = []
    let online = true
    const fetcher = (async (_input: string, init?: RequestInit) => {
      if (!online) throw new TypeError('fetch failed')
      const tag = new Headers(init?.headers).get('if-none-match')
      asked.push(tag)
      if (tag === '"p1"') return new Response(null, { status: 304 })
      return Response.json([pull], { headers: { etag: '"p1"' } })
    }) as unknown as typeof fetch
    const options = { fetch: fetcher, findToken: async () => ({ token: 'secret-token', source: 'gh' as const }) }

    const first = createDiskCache(dir)
    expect((await createGitHub(repo.path, { ...options, cache: first }).pulls('open'))[0]?.number).toBe(7)
    await first.flush()
    expect(readFileSync(join(dir, 'cache', 'github.json'), 'utf8')).not.toContain('secret-token')

    const restarted = createGitHub(repo.path, { ...options, cache: createDiskCache(dir) })
    expect((await restarted.pulls('open'))[0]?.number).toBe(7)
    expect(asked).toEqual([null, '"p1"'])

    online = false
    const offline = createGitHub(repo.path, { ...options, cache: createDiskCache(dir) })
    expect((await offline.pulls('open'))[0]?.number).toBe(7)
  })
})
