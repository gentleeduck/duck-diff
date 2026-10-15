import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { parseGitHubRemote } from '../github'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo | undefined
let server: RunningServer | undefined
afterEach(async () => {
  await server?.stop()
  repo?.cleanup()
  server = undefined
  repo = undefined
})

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
  labels: [{ name: 'bug', color: 'ff0000' }],
  html_url: 'https://github.com/o/r/pull/7',
}

interface Call {
  method: string
  path: string
  body: unknown
  auth: string | null
}

// A tiny stand-in for api.github.com that records what the server asked for.
function fakeGitHub(calls: Call[]) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    calls.push({
      method,
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      auth: headers.get('authorization'),
    })
    const path = url.pathname
    if (path === '/user') return Response.json(user)
    if (path === '/repos/o/r/pulls' && method === 'GET') return Response.json([pull])
    if (path === '/repos/o/r/pulls' && method === 'POST') return Response.json({ ...pull, number: 8 }, { status: 201 })
    if (path === '/repos/o/r') return Response.json({ default_branch: 'trunk' })
    if (path === '/repos/o/r/commits' && url.searchParams.get('page') === '1') {
      return Response.json([{ commit: { author: { email: 'Octo@X.dev' } }, author: user }])
    }
    if (path === '/repos/o/r/commits') return Response.json([])
    if (path === '/repos/o/r/commits/h1/check-runs') {
      return Response.json({
        check_runs: [
          { name: 'test', status: 'completed', conclusion: 'success', html_url: 'https://ci/1' },
          { name: 'lint', status: 'in_progress', conclusion: null, html_url: null },
        ],
      })
    }
    if (path === '/repos/o/r/pulls/7' && method === 'GET') {
      return Response.json({ ...pull, body: 'Why', mergeable: true, additions: 3, deletions: 1, changed_files: 2 })
    }
    if (path === '/repos/o/r/issues/7/comments' && method === 'GET') {
      return Response.json([{ id: 1, user, body: 'Looks good', created_at: '2026-10-02T00:00:00Z' }])
    }
    if (path === '/repos/o/r/pulls/7/comments' && method === 'GET') return Response.json([])
    if (path === '/repos/o/r/pulls/7/comments' && method === 'POST') {
      return Response.json({ id: 2, user, body: 'nit', created_at: 'x', path: 'a.ts', line: 3, side: 'RIGHT' })
    }
    if (path === '/repos/o/r/issues' && method === 'GET') {
      return Response.json([
        { number: 1, title: 'Bug', state: 'open', user, created_at: 'x', updated_at: 'y', comments: 0, html_url: 'u' },
        {
          number: 7,
          title: 'PR',
          state: 'open',
          user,
          created_at: 'x',
          updated_at: 'y',
          comments: 0,
          html_url: 'u',
          pull_request: {},
        },
      ])
    }
    if (path === '/repos/o/r/pulls/7/comments/2/replies') {
      return Response.json({ id: 3, user, body: 'done', created_at: 'x', path: 'a.ts', line: 3, in_reply_to_id: 2 })
    }
    if (path === '/repos/o/r/pulls/7/merge') return Response.json({ merged: true })
    if (path === '/repos/o/r/pulls/7/reviews') return Response.json({ id: 9 })
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }
}

async function start(options: { token: string | null; remote?: string; calls?: Call[] }) {
  repo = createRepo()
  repo.write('a.txt', '1\n')
  repo.commit('base')
  if (options.remote !== undefined) repo.git('remote', 'add', 'origin', options.remote)
  server = await createServer({
    repo: repo.path,
    port: testPort(),
    watch: false,
    github: {
      fetch: fakeGitHub(options.calls ?? []) as typeof fetch,
      findToken: async () => (options.token ? { token: options.token, source: 'gh' } : null),
    },
  })
}

const call = (method: string, path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${server?.port}${path}`, {
    method,
    headers: { 'x-duck-diff-token': server?.token ?? '', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('GitHub remotes', () => {
  it('reads owner and name from ssh and https urls', () => {
    expect(parseGitHubRemote('git@github.com:gentleeduck/duck-diff.git')).toBe('gentleeduck/duck-diff')
    expect(parseGitHubRemote('https://github.com/o/r')).toBe('o/r')
    expect(parseGitHubRemote('ssh://git@github.com/o/r.git')).toBe('o/r')
    expect(parseGitHubRemote('git@gitlab.com:o/r.git')).toBeNull()
  })
})

describe('/api/github', () => {
  it('reports the signed-in user and the repo, without ever sending the token to the page', async () => {
    const calls: Call[] = []
    await start({ token: 'secret-token', remote: 'git@github.com:o/r.git', calls })
    const status = await (await call('GET', '/api/github/status')).json()
    expect(status).toEqual({ repo: 'o/r', user: { login: 'octo', avatarUrl: 'https://a/octo.png' }, source: 'gh' })
    expect(JSON.stringify(status)).not.toContain('secret-token')
    expect(calls[0]?.auth).toBe('Bearer secret-token')
  })

  it('lists pull requests and builds a pull request page with its conversation', async () => {
    await start({ token: 't', remote: 'git@github.com:o/r.git' })
    const pulls = await (await call('GET', '/api/github/pulls')).json()
    expect(pulls[0]).toMatchObject({ number: 7, headRef: 'feat', baseRef: 'main', labels: [{ name: 'bug' }] })
    const details = await (await call('GET', '/api/github/pulls/7')).json()
    expect(details).toMatchObject({ body: 'Why', headSha: 'h1', changedFiles: 2, comments: [{ body: 'Looks good' }] })
  })

  it('posts review comments on the head commit, replies, reviews and merges', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    const posted = await call('POST', '/api/github/pulls/7/review-comments', {
      body: 'nit',
      path: 'a.ts',
      line: 3,
      side: 'RIGHT',
    })
    expect(posted.status).toBe(200)
    expect(calls.find((entry) => entry.method === 'POST')?.body).toEqual({
      body: 'nit',
      path: 'a.ts',
      line: 3,
      side: 'RIGHT',
      commit_id: 'h1',
    })
    const reply = await (await call('POST', '/api/github/pulls/7/replies', { inReplyTo: 2, body: 'done' })).json()
    expect(reply).toMatchObject({ id: 3, inReplyTo: 2, side: 'RIGHT' })
    expect((await call('POST', '/api/github/pulls/7/reviews', { event: 'APPROVE', body: '' })).status).toBe(204)
    expect((await call('POST', '/api/github/pulls/7/merge', { method: 'squash' })).status).toBe(204)
    expect(calls.find((entry) => entry.path.endsWith('/merge'))?.body).toEqual({ merge_method: 'squash' })
  })

  it('opens a pull request against the default branch', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    expect(await (await call('GET', '/api/github/default-branch')).json()).toEqual({ branch: 'trunk' })
    const input = { title: 'New', body: '', head: 'feat', base: 'trunk', draft: true }
    const created = await call('POST', '/api/github/pulls', input)
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ number: 8 })
    expect(calls.find((entry) => entry.method === 'POST')?.body).toEqual(input)
  })

  it("reads the check runs on a pull request's head commit", async () => {
    await start({ token: 't', remote: 'git@github.com:o/r.git' })
    expect(await (await call('GET', '/api/github/pulls/7/checks')).json()).toEqual([
      { name: 'test', status: 'completed', conclusion: 'success', url: 'https://ci/1' },
      { name: 'lint', status: 'in_progress', conclusion: null, url: '' },
    ])
  })

  it('maps commit emails to avatars, and answers none when signed out', async () => {
    await start({ token: 't', remote: 'git@github.com:o/r.git' })
    expect(await (await call('GET', '/api/github/avatars')).json()).toEqual({ 'octo@x.dev': 'https://a/octo.png' })
    await server?.stop()
    repo?.cleanup()
    await start({ token: null, remote: 'git@github.com:o/r.git' })
    expect(await (await call('GET', '/api/github/avatars')).json()).toEqual({})
  })

  it('lists issues without the pull requests GitHub mixes in', async () => {
    await start({ token: 't', remote: 'git@github.com:o/r.git' })
    const issues = await (await call('GET', '/api/github/issues')).json()
    expect(issues.map((issue: { number: number }) => issue.number)).toEqual([1])
  })

  it('answers 401 when signed out, takes a pasted token, and 409 without a GitHub remote', async () => {
    await start({ token: null, remote: 'git@github.com:o/r.git' })
    expect(await (await call('GET', '/api/github/status')).json()).toMatchObject({ user: null, source: null })
    expect((await call('GET', '/api/github/pulls')).status).toBe(401)
    const status = await (await call('POST', '/api/github/token', { token: 'ghp_pastedtoken' })).json()
    expect(status).toMatchObject({ source: 'token', user: { login: 'octo' } })
    await server?.stop()
    repo?.cleanup()
    await start({ token: 't' })
    expect((await call('GET', '/api/github/pulls')).status).toBe(409)
  })
})
