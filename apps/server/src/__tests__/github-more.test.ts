import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo | undefined
let server: RunningServer | undefined
afterEach(async () => {
  await server?.stop()
  repo?.cleanup()
})

interface Call {
  method: string
  path: string
  body: { query?: string; variables?: Record<string, unknown> } & Record<string, unknown>
}

const author = { login: 'ann', avatarUrl: 'https://a/ann.png' }
const discussion = {
  number: 3,
  title: 'How to configure?',
  url: 'https://github.com/o/r/discussions/3',
  updatedAt: 't',
  author,
  category: { name: 'Q&A', emoji: ':pray:', isAnswerable: true },
  answer: null,
  comments: { totalCount: 1 },
}

function fake(calls: Call[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ method: init?.method ?? 'GET', path: url.pathname + url.search, body })
    if (url.pathname === '/graphql') {
      const query = String(body.query)
      if (query.includes('discussions(first'))
        return Response.json({ data: { repository: { discussions: { nodes: [discussion] } } } })
      if (query.includes('discussion(number'))
        return Response.json({
          data: {
            repository: {
              discussion: {
                ...discussion,
                id: 'D_3',
                body: 'question',
                createdAt: 't0',
                comments: {
                  totalCount: 1,
                  nodes: [
                    {
                      id: 'C_1',
                      body: 'try this',
                      createdAt: 't1',
                      isAnswer: false,
                      author,
                      replies: { nodes: [{ id: 'C_2', body: 'thanks', createdAt: 't2', author }] },
                    },
                  ],
                },
              },
            },
          },
        })
      if (query.includes('mergeQueueEntry'))
        return Response.json({
          data: {
            repository: { pullRequest: { baseRefName: 'main', mergeQueueEntry: { position: 2, state: 'QUEUED' } } },
          },
        })
      if (query.includes('mergeQueue(branch'))
        return Response.json({ data: { repository: { mergeQueue: { id: 'Q' } } } })
      if (query.includes('issueOrPullRequest'))
        return Response.json({ data: { repository: { issueOrPullRequest: { id: 'PR_7' } } } })
      return Response.json({ data: { ok: true } })
    }
    if (url.pathname === '/repos/o/r/dependabot/alerts')
      return Response.json([
        {
          number: 4,
          created_at: 't',
          html_url: 'u',
          security_advisory: { severity: 'high', summary: 'Prototype pollution' },
          dependency: { package: { name: 'lodash' }, manifest_path: 'package.json' },
        },
      ])
    if (url.pathname === '/repos/o/r/code-scanning/alerts')
      return Response.json({ message: 'Advanced Security must be enabled' }, { status: 403 })
    if (url.pathname.startsWith('/repos/o/r/dependabot/alerts/') && init?.method === 'PATCH') return Response.json({})
    return Response.json({ message: 'Not Found' }, { status: 404 })
  }) as typeof fetch
}

async function start(calls: Call[]) {
  repo = createRepo()
  repo.git('remote', 'add', 'origin', 'git@github.com:o/r.git')
  server = await createServer({
    repo: repo.path,
    port: testPort(),
    watch: false,
    github: { fetch: fake(calls), findToken: async () => ({ token: 't', source: 'gh' }) },
  })
}
const call = (method: string, path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${server?.port}${path}`, {
    method,
    headers: { 'x-duck-diff-token': server?.token ?? '', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('discussions', () => {
  it('lists, reads with replies, replies, and marks an answer', async () => {
    const calls: Call[] = []
    await start(calls)
    const list = await (await call('GET', '/api/github/discussions')).json()
    expect(list).toEqual([
      {
        number: 3,
        title: 'How to configure?',
        author: { login: 'ann', avatarUrl: 'https://a/ann.png' },
        category: 'Q&A',
        emoji: ':pray:',
        answered: false,
        comments: 1,
        updatedAt: 't',
        url: 'https://github.com/o/r/discussions/3',
      },
    ])
    const one = await (await call('GET', '/api/github/discussions/3')).json()
    expect(one).toMatchObject({ id: 'D_3', body: 'question', answerable: true })
    expect(one.thread[0]).toMatchObject({ id: 'C_1', answer: false, replies: [{ id: 'C_2', body: 'thanks' }] })

    expect((await call('POST', '/api/github/discussions/3/reply', { body: 'me too', replyTo: 'C_1' })).status).toBe(204)
    expect(calls.at(-1)?.body.variables).toEqual({ id: 'D_3', body: 'me too', replyTo: 'C_1' })
    expect((await call('POST', '/api/github/discussions/3/answer', { comment: 'C_1', answer: true })).status).toBe(204)
    expect(String(calls.at(-1)?.body.query)).toContain('markDiscussionCommentAsAnswer')
  })
})

describe('security alerts', () => {
  it('lists what it can read, says what it cannot, and dismisses', async () => {
    const calls: Call[] = []
    await start(calls)
    const found = await (await call('GET', '/api/github/security')).json()
    expect(found.alerts).toEqual([
      {
        kind: 'dependabot',
        number: 4,
        severity: 'high',
        summary: 'Prototype pollution',
        subject: 'lodash',
        path: 'package.json',
        createdAt: 't',
        url: 'u',
      },
    ])
    expect(found.unavailable).toEqual([{ kind: 'code-scanning', reason: 'GitHub: Advanced Security must be enabled' }])
    const dismissed = await call('POST', '/api/github/security', {
      kind: 'dependabot',
      number: 4,
      reason: 'tolerable_risk',
    })
    expect(dismissed.status).toBe(204)
    expect(calls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: '/repos/o/r/dependabot/alerts/4',
      body: { state: 'dismissed', dismissed_reason: 'tolerable_risk' },
    })
  })
})

describe('merge queue', () => {
  it('reads the position and adds a pull request to the queue', async () => {
    const calls: Call[] = []
    await start(calls)
    expect(await (await call('GET', '/api/github/pulls/7/queue')).json()).toEqual({
      enabled: true,
      position: 2,
      state: 'QUEUED',
    })
    expect((await call('POST', '/api/github/pulls/7/queue', { queued: true })).status).toBe(204)
    expect(String(calls.at(-1)?.body.query)).toContain('enqueuePullRequest')
    expect(calls.at(-1)?.body.variables).toEqual({ id: 'PR_7' })
  })
})

describe('insights', () => {
  it('answers from local history', async () => {
    await start([])
    repo?.write('a.txt', 'a\n')
    repo?.commit('one')
    // Test commits carry a fixed date early in the year, outside a month and inside a year.
    expect((await (await call('GET', '/api/insights?days=30')).json()).total).toBe(0)
    const insights = await (await call('GET', '/api/insights?days=365')).json()
    expect(insights.total).toBe(1)
    expect(insights.contributors).toHaveLength(1)
    expect((await call('GET', '/api/insights?days=0')).status).toBe(400)
  })
})
