import { runGit } from '@duck-diff/git'
import {
  CreateIssueSchema,
  MergePullSchema,
  PostCommentSchema,
  PostReviewCommentSchema,
  type PullRefs,
  ReplySchema,
  SetTokenSchema,
  SubmitReviewSchema,
} from '@duck-diff/protocol'
import { z } from 'zod'
import { HttpError } from './errors'
import type { GitHub } from './github'

const State = z.object({ state: z.enum(['open', 'closed']).default('open') })
const NETWORK_TIMEOUT_MS = 120_000

// A pull request's head lands in a private ref so the diff viewer can compare it like any other range.
async function fetchPull(repo: string, number: number, baseRef: string): Promise<PullRefs> {
  const head = `refs/duck-diff/pr/${number}`
  await runGit(['fetch', '--quiet', 'origin', `+pull/${number}/head:${head}`, baseRef], {
    cwd: repo,
    timeoutMs: NETWORK_TIMEOUT_MS,
  })
  return { base: `origin/${baseRef}`, head }
}

export async function handleGitHub(
  github: GitHub,
  repo: string,
  url: URL,
  request: Request,
  enqueue: <T>(task: () => Promise<T>) => Promise<T>,
): Promise<Response> {
  const parts = url.pathname.slice('/api/github/'.length).split('/')
  const [area, id, action] = parts
  const number = id === undefined ? Number.NaN : Number(id)
  const post = request.method === 'POST'
  const body = async () => (await request.json()) as unknown

  if (area === 'status') return Response.json(await github.status())
  if (area === 'token' && post) {
    github.setToken(SetTokenSchema.parse(await body()).token)
    return Response.json(await github.status())
  }
  if (area === 'pulls') {
    if (id === undefined)
      return Response.json(await github.pulls(State.parse(Object.fromEntries(url.searchParams)).state))
    if (!Number.isInteger(number)) throw new HttpError(400, 'bad-request', 'bad pull request number')
    if (action === undefined) return Response.json(await github.pull(number))
    if (action === 'comments' && post)
      return Response.json(await github.commentOn(number, PostCommentSchema.parse(await body()).body))
    if (action === 'review-comments' && post) {
      const input = PostReviewCommentSchema.parse(await body())
      const { headSha } = await github.pull(number)
      return Response.json(await github.reviewComment(number, { ...input, commitId: headSha }))
    }
    if (action === 'replies' && post) {
      const { inReplyTo, body: text } = ReplySchema.parse(await body())
      return Response.json(await github.reply(number, inReplyTo, text))
    }
    if (action === 'reviews' && post) {
      const { event, body: text } = SubmitReviewSchema.parse(await body())
      await github.submitReview(number, event, text)
      return new Response(null, { status: 204 })
    }
    if (action === 'merge' && post) {
      await github.merge(number, MergePullSchema.parse(await body()).method)
      return new Response(null, { status: 204 })
    }
    if (action === 'fetch' && post) {
      const { baseRef } = await github.pull(number)
      return Response.json(await enqueue(() => fetchPull(repo, number, baseRef)))
    }
  }
  if (area === 'issues') {
    if (id === undefined) {
      if (post) {
        const { title, body: text } = CreateIssueSchema.parse(await body())
        return Response.json(await github.createIssue(title, text), { status: 201 })
      }
      return Response.json(await github.issues(State.parse(Object.fromEntries(url.searchParams)).state))
    }
    if (!Number.isInteger(number)) throw new HttpError(400, 'bad-request', 'bad issue number')
    if (action === undefined) return Response.json(await github.issue(number))
    if (action === 'comments' && post)
      return Response.json(await github.commentOn(number, PostCommentSchema.parse(await body()).body))
    if (action === 'state' && post) {
      await github.setIssueState(number, State.parse(await body()).state)
      return new Response(null, { status: 204 })
    }
  }
  throw new HttpError(404, 'not-found', `no GitHub route ${url.pathname}`)
}
