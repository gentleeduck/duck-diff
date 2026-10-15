import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createGitLab } from '../gitlab'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

const author = { username: 'duck', avatar_url: 'https://gl/duck.png' }
const mr = (iid: number, state: string, updated: string) => ({
  id: 1000 + iid,
  iid,
  title: `MR ${iid}`,
  description: 'body',
  state,
  draft: false,
  author,
  assignees: [],
  labels: [{ name: 'bug', color: '#ff0000' }],
  milestone: null,
  user_notes_count: 2,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: updated,
  closed_at: null,
  merged_at: state === 'merged' ? updated : null,
  web_url: `https://gitlab.com/g/p/-/merge_requests/${iid}`,
  source_branch: 'feat',
  target_branch: 'main',
  source_project_id: 1,
  target_project_id: 1,
  sha: 'h1',
  diff_refs: { base_sha: 'b1', head_sha: 'h1' },
  merge_status: 'can_be_merged',
  detailed_merge_status: 'mergeable',
  changes_count: '3',
  reviewers: [{ username: 'ann', avatar_url: null }],
})

interface Call {
  method: string
  path: string
  body: unknown
}

function fakeGitLab(calls: Call[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace('/api/v4', '')
    calls.push({ method, path: path + url.search, body: init?.body ? JSON.parse(String(init.body)) : null })
    const project = '/projects/g%2Fp'
    const page = (body: unknown, total: number) => Response.json(body, { headers: { 'x-total': String(total) } })
    if (path === '/user') return Response.json(author)
    if (path === `${project}/merge_requests` && url.searchParams.get('state') === 'closed')
      return page([mr(4, 'closed', '2026-10-03T00:00:00Z')], 1)
    if (path === `${project}/merge_requests` && url.searchParams.get('state') === 'merged')
      return page([mr(5, 'merged', '2026-10-05T00:00:00Z')], 1)
    if (path === `${project}/merge_requests/7`) return Response.json(mr(7, 'opened', '2026-10-02T00:00:00Z'))
    if (path === `${project}/merge_requests/7/notes` && method === 'GET')
      return Response.json([
        { id: 1, body: 'looks good', author, created_at: 't1', updated_at: 't1', system: false },
        { id: 2, body: 'added 1 commit', author, created_at: 't2', updated_at: 't2', system: true },
        {
          id: 3,
          body: 'nit',
          author,
          created_at: 't3',
          updated_at: 't3',
          system: false,
          position: { new_path: 'a.ts', old_path: 'a.ts', new_line: 4, old_line: null },
        },
      ])
    if (path === `${project}/merge_requests/7/notes` && method === 'POST')
      return Response.json({ id: 9, body: 'hi', author, created_at: 't9', updated_at: 't9', system: false })
    if (path === `${project}/merge_requests/7/commits`) return Response.json([{}, {}])
    if (path === `${project}/merge_requests/7/approvals`)
      return Response.json({ approved_by: [{ user: { username: 'ann', avatar_url: null } }] })
    if (path === `${project}/merge_requests/7/pipelines`) return Response.json([{ id: 50 }])
    if (path === `${project}/pipelines/50/jobs`)
      return Response.json([
        { id: 1, name: 'test', stage: 'check', status: 'failed', web_url: 'u1', duration: 12.4 },
        { id: 2, name: 'lint', stage: 'check', status: 'running', web_url: 'u2', duration: null },
      ])
    if (path === '/todos')
      return Response.json([
        {
          id: 77,
          action_name: 'review_requested',
          target_type: 'MergeRequest',
          state: 'pending',
          updated_at: 't',
          target: { iid: 7, title: 'MR 7' },
        },
      ])
    if (path === `${project}/issues` && url.searchParams.get('per_page') === '1')
      return page([{ id: 1, updated_at: url.searchParams.get('marker') ?? 'u1' }], 1)
    return new Response('{"message":"404 Not found"}', { status: 404 })
  }) as typeof fetch
}

let repo: TestRepo | undefined
let server: RunningServer | undefined
afterEach(async () => {
  await server?.stop()
  repo?.cleanup()
  server = undefined
  repo = undefined
})

async function start(calls: Call[]) {
  repo = createRepo()
  repo.git('remote', 'add', 'origin', 'git@gitlab.com:g/p.git')
  server = await createServer({
    repo: repo.path,
    port: testPort(),
    watch: false,
    gitlab: { fetch: fakeGitLab(calls), findToken: async () => ({ token: 'glpat', source: 'env' }) },
    github: {
      fetch: (async () => {
        throw new Error('GitHub must not be asked for a GitLab repo')
      }) as unknown as typeof fetch,
    },
  })
}

const call = (method: string, path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${server?.port}${path}`, {
    method,
    headers: { 'x-duck-diff-token': server?.token ?? '', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('GitLab forge', () => {
  it('signs in, and lists closed merge requests with merged ones, newest first', async () => {
    const calls: Call[] = []
    await start(calls)
    expect(await (await call('GET', '/api/github/status')).json()).toEqual({
      repo: 'g/p',
      user: { login: 'duck', avatarUrl: 'https://gl/duck.png' },
      source: 'env',
    })
    const page = await (await call('GET', '/api/github/list?kind=pr&state=closed')).json()
    expect(page.items.map((item: { number: number; merged: boolean }) => [item.number, item.merged])).toEqual([
      [5, true],
      [4, false],
    ])
    expect(page.total).toBe(2)
    expect(page.items[0].labels).toEqual([{ name: 'bug', color: 'ff0000' }])
  })

  it('reads a merge request with approvals, review notes and checks, and comments on it', async () => {
    const calls: Call[] = []
    await start(calls)
    const pull = await (await call('GET', '/api/github/pulls/7')).json()
    expect(pull).toMatchObject({
      number: 7,
      headRef: 'feat',
      baseRef: 'main',
      commits: 2,
      changedFiles: 3,
      mergeable: true,
      reviewers: [{ login: 'ann', avatarUrl: '', state: 'APPROVED' }],
    })
    expect(pull.comments.map((entry: { body: string }) => entry.body)).toEqual(['looks good'])
    expect(pull.reviewComments[0]).toMatchObject({ path: 'a.ts', line: 4, side: 'RIGHT', body: 'nit' })

    const thread = await (await call('GET', '/api/github/threads/7?kind=pr')).json()
    expect(thread.timeline.map((entry: { kind: string }) => entry.kind)).toEqual(['comment', 'event'])

    const checks = await (await call('GET', '/api/github/pulls/7/checks')).json()
    expect(
      checks.map((check: { name: string; status: string; conclusion: string | null }) => [
        check.name,
        check.status,
        check.conclusion,
      ]),
    ).toEqual([
      ['check / test', 'completed', 'failure'],
      ['check / lint', 'in_progress', null],
    ])

    expect((await call('POST', '/api/github/pulls/7/comments', { body: 'hi' })).status).toBe(200)
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/projects/g%2Fp/merge_requests/7/notes',
      body: { body: 'hi' },
    })
  })

  it('reads to-dos as notifications and says plainly what GitLab cannot do here', async () => {
    await start([])
    expect(await (await call('GET', '/api/github/notifications')).json()).toEqual([
      {
        id: '77',
        title: 'MR 7',
        type: 'PullRequest',
        reason: 'review_requested',
        unread: true,
        updatedAt: 't',
        number: 7,
      },
    ])
    const transfer = await call('POST', '/api/github/threads/3/transfer', { repo: 'x/y' })
    expect(transfer.status).toBe(501)
  })

  it('probes a list by its newest entry', async () => {
    const calls: Call[] = []
    const gitlab = createGitLab(
      { kind: 'gitlab', host: 'gitlab.com', slug: 'g/p' },
      { fetch: fakeGitLab(calls), findToken: async () => ({ token: 't', source: 'env' }) },
    )
    expect(await gitlab.probe('issues')).toEqual({ changed: null })
    expect(await gitlab.probe('issues')).toEqual({ changed: false })
    expect(await gitlab.probe('nothing')).toEqual({ changed: false })
  })
})
