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
    if (path === '/repos/o/r/issues/1' && method === 'GET') {
      if (headers.get('if-none-match') === '"v1"') return new Response(null, { status: 304 })
      return Response.json(
        {
          number: 1,
          title: 'Bug',
          state: 'open',
          user,
          created_at: 'x',
          updated_at: 'y',
          comments: 0,
          html_url: 'u',
          body: 'b',
        },
        { headers: { etag: '"v1"' } },
      )
    }
    if (path === '/repos/o/r/issues/1/comments') return Response.json([])
    if (path === '/repos/o/r/pulls' && method === 'GET') return Response.json([pull])
    if (path === '/repos/o/r/pulls' && method === 'POST') return Response.json({ ...pull, number: 8 }, { status: 201 })
    if (path === '/repos/o/r') return Response.json({ default_branch: 'trunk', permissions: { push: false } })
    if (path === '/repos/o/r/issues/9' && method === 'GET') {
      return Response.json({
        number: 9,
        title: 'Bug',
        body: 'Steps',
        user,
        created_at: 'a',
        updated_at: 'b',
        reactions: { '+1': 2, heart: 0, total_count: 2 },
      })
    }
    if (path === '/repos/o/r/issues/9/timeline') {
      return Response.json([
        {
          event: 'commented',
          id: 1,
          user,
          body: 'me too',
          created_at: 'c',
          updated_at: 'c',
          reactions: { eyes: 1 },
          html_url: 'h',
        },
        { event: 'labeled', actor: user, label: { name: 'bug' }, created_at: 'd', node_id: 'n1' },
        { event: 'renamed', actor: user, rename: { from: 'Bg', to: 'Bug' }, created_at: 'e', node_id: 'n2' },
        { event: 'subscribed', actor: user, created_at: 'f' },
        { event: 'committed', sha: 'abc1234', message: 'fix', author: { name: 'Octo', date: 'g' } },
      ])
    }
    if (path === '/repos/o/r/issues/comments/1' && method === 'PATCH') return new Response(null, { status: 200 })
    if (path === '/repos/o/r/issues/comments/1/reactions' && method === 'POST') {
      return Response.json({ id: 55, content: 'heart' }, { status: 200 })
    }
    if (path === '/repos/o/r/issues/comments/1/reactions/55') return new Response(null, { status: 204 })
    if (path === '/repos/o/r/assignees') return Response.json([user])
    if (path === '/repos/o/r/notifications' && method === 'GET') {
      return Response.json([
        {
          id: '55',
          reason: 'review_requested',
          unread: true,
          updated_at: 'x',
          subject: { title: 'Add things', type: 'PullRequest', url: 'https://api.github.com/repos/o/r/pulls/7' },
        },
      ])
    }
    if (path === '/notifications/threads/55') return new Response(null, { status: 205 })
    if (path === '/repos/o/r/releases' && method === 'GET') {
      return Response.json([
        {
          id: 1,
          name: null,
          tag_name: 'v1',
          body: 'notes',
          draft: false,
          prerelease: false,
          published_at: 'p',
          author: user,
          html_url: 'r',
        },
      ])
    }
    if (path === '/repos/o/r/releases' && method === 'POST') {
      return Response.json(
        {
          id: 2,
          name: 'v2',
          tag_name: 'v2',
          body: '',
          draft: true,
          prerelease: false,
          published_at: null,
          author: user,
          html_url: 'r2',
        },
        { status: 201 },
      )
    }
    if (path === '/repos/o/r/actions/runs' && method === 'GET') {
      return Response.json({
        workflow_runs: [
          {
            id: 9,
            name: 'ci',
            display_title: 'feat: x',
            status: 'completed',
            conclusion: 'failure',
            head_branch: 'feat',
            event: 'push',
            created_at: 'c',
            actor: user,
            html_url: 'h',
          },
        ],
      })
    }
    if (path === '/repos/o/r/actions/runs/9/rerun-failed-jobs') return new Response(null, { status: 201 })
    if (path === '/repos/o/r/labels') return Response.json([{ name: 'bug', color: 'f00', description: null }])
    if (path === '/repos/o/r/milestones') return Response.json([{ number: 3, title: 'v1' }])
    if (path === '/repos/o/r/pulls/7/requested_reviewers') return Response.json({})
    if (path === '/repos/o/r/issues/9' && method === 'PATCH') return Response.json({})
    if (path === '/repos/o/r/issues/9/lock') return new Response(null, { status: 204 })
    if (
      path === '/graphql' &&
      String((JSON.parse(String(init?.body)) as { query: string }).query).includes('reviewThreads')
    ) {
      return Response.json({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [{ id: 'T1', isResolved: false, isOutdated: false, comments: { nodes: [{ databaseId: 2 }] } }],
              },
              files: {
                nodes: [
                  { path: 'a.ts', viewerViewedState: 'VIEWED' },
                  { path: 'b.ts', viewerViewedState: 'UNVIEWED' },
                ],
              },
            },
          },
        },
      })
    }
    const query = path === '/graphql' ? String((JSON.parse(String(init?.body)) as { query: string }).query) : ''
    if (query.includes('viewerSubscription')) {
      return Response.json({
        data: {
          repository: {
            issueOrPullRequest: {
              __typename: 'Issue',
              viewerSubscription: 'SUBSCRIBED',
              isPinned: true,
              closedByPullRequestsReferences: { nodes: [{ number: 7, title: 'Add things', state: 'MERGED' }] },
            },
          },
        },
      })
    }
    if (query.includes('projectItems')) return Response.json({ errors: [{ message: 'missing read:project' }] })
    if (query.includes('mergeStateStatus')) {
      return Response.json({
        data: {
          repository: {
            mergeCommitAllowed: false,
            squashMergeAllowed: true,
            rebaseMergeAllowed: true,
            autoMergeAllowed: true,
            deleteBranchOnMerge: true,
            viewerDefaultMergeMethod: 'MERGE',
            squashMergeCommitTitle: 'PR_TITLE',
            squashMergeCommitMessage: 'PR_BODY',
            mergeCommitTitle: 'MERGE_MESSAGE',
            mergeCommitMessage: 'PR_TITLE',
            pullRequest: {
              reviewDecision: 'REVIEW_REQUIRED',
              mergeStateStatus: 'BLOCKED',
              viewerCanMergeAsAdmin: true,
              autoMergeRequest: null,
              baseRef: { branchProtectionRule: { requiredApprovingReviewCount: 2 } },
            },
          },
        },
      })
    }
    if (query.includes('issueOrPullRequest(number: $number) { ... on Issue { id }')) {
      return Response.json({ data: { repository: { issueOrPullRequest: { id: 'I_9' } } } })
    }
    if (query.includes('name: $repo) { id }')) return Response.json({ data: { repository: { id: 'R_2' } } })
    if (query.includes('transferIssue')) {
      return Response.json({
        data: { transferIssue: { issue: { number: 4, url: 'https://github.com/o/other/issues/4' } } },
      })
    }
    if (query.startsWith('mutation')) return Response.json({ data: {} })
    if (path === '/repos/o/r/pulls/comments/31') {
      return Response.json({ path: 'src/a.ts', line: 3, start_line: 2, side: 'RIGHT', body: '```suggestion\nB\n```' })
    }
    if (path === '/repos/o/r/pulls/comments/32') {
      return Response.json({
        path: 'src/a.ts',
        line: 5,
        start_line: null,
        side: 'RIGHT',
        body: 'nit\n```suggestion\n```',
      })
    }
    if (path === '/repos/o/r/contents/src/a.ts') {
      return Response.json({ content: Buffer.from('1\n2\n3\n4\n5\n').toString('base64') })
    }
    if (path === '/graphql') {
      return Response.json({
        data: {
          search: {
            issueCount: 41,
            pageInfo: { hasNextPage: true, endCursor: 'c2' },
            nodes: [
              {
                number: 7,
                title: 'Add things',
                state: 'MERGED',
                url: 'u7',
                updatedAt: 'x',
                isDraft: false,
                merged: true,
                reviewDecision: 'APPROVED',
                author: { login: 'octo', avatarUrl: 'a' },
                labels: { nodes: [{ name: 'bug', color: 'f00' }] },
                comments: { totalCount: 3 },
                assignees: { nodes: [] },
                milestone: { title: 'v1' },
                commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
              },
              {},
            ],
          },
        },
      })
    }
    if (path === '/repos/o/r/commits' && url.searchParams.get('page') === '1') {
      return Response.json([{ commit: { author: { email: 'Octo@X.dev' } }, author: user }])
    }
    if (path === '/repos/o/r/commits') return Response.json([])
    if (path === '/repos/o/r/commits/h1/check-runs') {
      return Response.json({
        check_runs: [
          {
            name: 'test',
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com/o/r/actions/runs/11/job/22',
          },
          { name: 'lint', status: 'in_progress', conclusion: null, html_url: null },
        ],
      })
    }
    if (path === '/repos/o/r/pulls/7' && method === 'GET') {
      return Response.json({
        ...pull,
        head: { ...pull.head, repo: { full_name: 'o/r' } },
        requested_teams: [{ slug: 'web' }],
        body: 'Why',
        mergeable: true,
        additions: 3,
        deletions: 1,
        changed_files: 2,
      })
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
    if (path === '/repos/o/r/pulls/7/reviews' && method === 'GET') {
      return Response.json([
        { user: { login: 'duck', avatar_url: 'd' }, state: 'CHANGES_REQUESTED' },
        { user: { login: 'duck', avatar_url: 'd' }, state: 'APPROVED' },
      ])
    }
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
    expect(details).toMatchObject({
      body: 'Why',
      headSha: 'h1',
      changedFiles: 2,
      comments: [{ body: 'Looks good' }],
      reviewers: [
        { login: 'duck', state: 'APPROVED' },
        { login: 'o/web', state: null },
      ],
    })
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
      {
        name: 'test',
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.com/o/r/actions/runs/11/job/22',
        runId: 11,
        jobId: 22,
      },
      { name: 'lint', status: 'in_progress', conclusion: null, url: '', runId: null, jobId: null },
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

  it('searches with filters in one GraphQL request and maps review and CI state', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    const page = await (
      await call('GET', '/api/github/list?kind=pr&state=closed&filter=review-requested&sort=comments&query=label:bug')
    ).json()
    expect(page).toMatchObject({
      total: 41,
      cursor: 'c2',
      items: [
        {
          number: 7,
          state: 'closed',
          merged: true,
          review: 'APPROVED',
          checks: 'SUCCESS',
          milestone: 'v1',
          comments: 3,
        },
      ],
    })
    const body = calls.find((entry) => entry.path === '/graphql')?.body as { variables: { q: string } }
    expect(body.variables.q).toBe('repo:o/r is:pr is:closed review-requested:@me sort:comments-desc label:bug')
  })

  it('builds a thread with its timeline, and edits, reacts and suggests mentions', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    const thread = await (await call('GET', '/api/github/threads/9')).json()
    expect(thread).toMatchObject({
      title: 'Bug',
      edited: true,
      reactions: { '+1': 2 },
      viewer: { login: 'octo', canEdit: true },
      timeline: [
        { kind: 'comment', id: 1, body: 'me too', reactions: { eyes: 1 }, edited: false },
        { kind: 'event', text: 'added the bug label' },
        { kind: 'event', text: 'changed the title from "Bg" to "Bug"' },
        { kind: 'commit', sha: 'abc1234', message: 'fix' },
      ],
    })
    expect(thread.timeline).toHaveLength(4)
    expect((await call('PATCH', '/api/github/comments/1', { body: 'edited' })).status).toBe(204)
    // A reaction GitHub already had (200) is taken back with a delete.
    expect((await call('POST', '/api/github/react', { target: { comment: 1 }, content: 'heart' })).status).toBe(204)
    expect(calls.some((entry) => entry.method === 'DELETE' && entry.path.endsWith('/reactions/55'))).toBe(true)
    expect(await (await call('GET', '/api/github/mentions')).json()).toEqual([
      { login: 'octo', avatarUrl: 'https://a/octo.png' },
    ])
  })

  it('asks again with the ETag and serves the remembered answer on 304', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    expect(await (await call('GET', '/api/github/issues/1')).json()).toMatchObject({ title: 'Bug' })
    expect(await (await call('GET', '/api/github/issues/1')).json()).toMatchObject({ title: 'Bug' })
    expect(calls.filter((entry) => entry.path === '/repos/o/r/issues/1')).toHaveLength(2)
  })

  it('edits the sidebar: options, reviewers, labels, milestone, lock and draft', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    expect(await (await call('GET', '/api/github/options')).json()).toEqual({
      labels: [{ name: 'bug', color: 'f00', description: '' }],
      milestones: [{ number: 3, title: 'v1' }],
      people: [{ login: 'octo', avatarUrl: 'https://a/octo.png' }],
      teams: [],
    })
    expect(
      (await call('POST', '/api/github/pulls/7/reviewers', { add: ['duck', 'o/web'], remove: ['old'] })).status,
    ).toBe(204)
    const reviewerCalls = calls.filter((entry) => entry.path.endsWith('/requested_reviewers'))
    expect(reviewerCalls.map((entry) => [entry.method, entry.body])).toEqual([
      ['POST', { reviewers: ['duck'], team_reviewers: ['web'] }],
      ['DELETE', { reviewers: ['old'], team_reviewers: [] }],
    ])
    expect((await call('PATCH', '/api/github/threads/9', { labels: ['bug'], milestone: 3 })).status).toBe(204)
    expect(calls.find((entry) => entry.method === 'PATCH' && entry.path === '/repos/o/r/issues/9')?.body).toEqual({
      labels: ['bug'],
      milestone: 3,
    })
    expect((await call('POST', '/api/github/threads/9/lock', { locked: true })).status).toBe(204)
    expect(calls.some((entry) => entry.method === 'PUT' && entry.path === '/repos/o/r/issues/9/lock')).toBe(true)
  })

  it('reads review threads and viewed files, resolves threads and submits a review with its comments', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    expect(await (await call('GET', '/api/github/pulls/7/review-state')).json()).toEqual({
      threads: [{ id: 'T1', resolved: false, outdated: false, root: 2 }],
      viewed: ['a.ts'],
    })
    expect((await call('POST', '/api/github/pulls/7/resolve', { thread: 'T1', resolved: true })).status).toBe(204)
    const mutation = calls.filter((entry) => entry.path === '/graphql').at(-1)?.body as {
      query: string
      variables: unknown
    }
    expect(mutation.query).toContain('resolveReviewThread')
    expect(mutation.variables).toEqual({ id: 'T1' })
    const comments = [{ path: 'a.ts', line: 3, side: 'RIGHT', body: 'nit' }]
    expect((await call('POST', '/api/github/pulls/7/reviews', { event: 'COMMENT', body: 'ok', comments })).status).toBe(
      204,
    )
    expect(calls.findLast((entry) => entry.path === '/repos/o/r/pulls/7/reviews')?.body).toEqual({
      event: 'COMMENT',
      body: 'ok',
      comments,
    })
  })

  it('reads notifications, releases and workflow runs, and acts on them', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    expect(await (await call('GET', '/api/github/notifications')).json()).toEqual([
      {
        id: '55',
        title: 'Add things',
        type: 'PullRequest',
        reason: 'review_requested',
        unread: true,
        updatedAt: 'x',
        number: 7,
      },
    ])
    expect((await call('POST', '/api/github/notifications', { id: '55' })).status).toBe(204)
    expect(await (await call('GET', '/api/github/releases')).json()).toMatchObject([{ name: 'v1', tag: 'v1' }])
    const created = await call('POST', '/api/github/releases', {
      tag: 'v2',
      name: '',
      body: '',
      draft: true,
      prerelease: false,
      generateNotes: true,
    })
    expect(created.status).toBe(201)
    expect(calls.findLast((entry) => entry.path === '/repos/o/r/releases')?.body).toMatchObject({
      tag_name: 'v2',
      name: 'v2',
      generate_release_notes: true,
    })
    expect(await (await call('GET', '/api/github/runs')).json()).toMatchObject([
      { id: 9, conclusion: 'failure', branch: 'feat' },
    ])
    expect((await call('POST', '/api/github/runs', { runId: 9, action: 'rerun-failed' })).status).toBe(204)
  })

  it('reads linked work and subscription, then subscribes, pins and transfers an issue', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    expect(await (await call('GET', '/api/github/threads/9/extras')).json()).toEqual({
      subscription: 'SUBSCRIBED',
      pinned: true,
      projects: null,
      linked: [{ number: 7, title: 'Add things', pull: true, state: 'merged' }],
    })
    const last = () =>
      calls.filter((entry) => entry.path === '/graphql').at(-1)?.body as { query: string; variables: unknown }
    expect((await call('POST', '/api/github/threads/9/subscription', { subscribed: false })).status).toBe(204)
    expect(last().query).toContain('updateSubscription')
    expect(last().variables).toEqual({ id: 'I_9', state: 'UNSUBSCRIBED' })
    expect((await call('POST', '/api/github/threads/9/pin', { pinned: false })).status).toBe(204)
    expect(last().query).toContain('unpinIssue')
    expect((await call('POST', '/api/github/threads/9/transfer', { repo: 'o/other' })).json()).resolves.toEqual({
      number: 4,
      url: 'https://github.com/o/other/issues/4',
    })
    expect((await call('POST', '/api/github/threads/9/transfer', { repo: 'not a repo' })).status).toBe(400)
  })

  it('lists requested teams as org/slug reviewers and reads merge settings', async () => {
    await start({ token: 't', remote: 'git@github.com:o/r.git' })
    const pullPage = (await (await call('GET', '/api/github/pulls/7')).json()) as { reviewers: { login: string }[] }
    expect(pullPage.reviewers.map((reviewer) => reviewer.login)).toContain('o/web')
    expect(await (await call('GET', '/api/github/pulls/7/merge-info')).json()).toEqual({
      methods: ['squash', 'rebase'],
      defaultMethod: 'squash',
      autoMergeAllowed: true,
      deleteBranchOnMerge: true,
      reviewDecision: 'REVIEW_REQUIRED',
      requiredApprovals: 2,
      mergeState: 'BLOCKED',
      canMergeAsAdmin: true,
      autoMerge: null,
      squashTitle: 'PR_TITLE',
      squashMessage: 'PR_BODY',
      mergeTitle: 'MERGE_MESSAGE',
      mergeMessage: 'PR_TITLE',
    })
  })

  it('merges with a commit title and head guard, and updates the branch by rebase', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    const merged = await call('POST', '/api/github/pulls/7/merge', {
      method: 'squash',
      title: 'Add things (#7)',
      message: 'Why',
      sha: 'h1',
    })
    expect(merged.status).toBe(204)
    expect(calls.findLast((entry) => entry.path === '/repos/o/r/pulls/7/merge')?.body).toEqual({
      merge_method: 'squash',
      commit_title: 'Add things (#7)',
      commit_message: 'Why',
      sha: 'h1',
    })
    expect((await call('POST', '/api/github/pulls/7/update-branch', { method: 'rebase' })).status).toBe(204)
    const mutation = calls.filter((entry) => entry.path === '/graphql').at(-1)?.body as { query: string }
    expect(mutation.query).toContain('updatePullRequestBranch')
  })

  it('commits a batch of suggestions to the head branch as one commit', async () => {
    const calls: Call[] = []
    await start({ token: 't', remote: 'git@github.com:o/r.git', calls })
    const answer = await call('POST', '/api/github/pulls/7/suggestions', {
      ids: [31, 32],
      message: 'Apply suggestions',
    })
    expect(answer.status).toBe(204)
    const commit = calls.filter((entry) => entry.path === '/graphql').at(-1)?.body as {
      query: string
      variables: {
        input: {
          branch: unknown
          expectedHeadOid: string
          fileChanges: { additions: { path: string; contents: string }[] }
        }
      }
    }
    expect(commit.query).toContain('createCommitOnBranch')
    expect(commit.variables.input.branch).toEqual({ repositoryNameWithOwner: 'o/r', branchName: 'feat' })
    expect(commit.variables.input.expectedHeadOid).toBe('h1')
    const [file] = commit.variables.input.fileChanges.additions
    expect(file?.path).toBe('src/a.ts')
    expect(Buffer.from(file?.contents ?? '', 'base64').toString()).toBe('1\nB\n4\n')
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
