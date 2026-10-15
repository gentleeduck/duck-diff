import { runGit } from '@duck-diff/git'
import {
  ApplySuggestionsSchema,
  AutoMergeSchema,
  BaseSchema,
  CreateIssueSchema,
  CreatePullSchema,
  CreateReleaseSchema,
  DraftSchema,
  EditIssueSchema,
  ListQuerySchema,
  LockSchema,
  MergePullSchema,
  PinSchema,
  PostCommentSchema,
  PostReviewCommentSchema,
  type PullRefs,
  ReactSchema,
  ReplySchema,
  RerunSchema,
  ResolveThreadSchema,
  ReviewersSchema,
  RunActionSchema,
  SetTokenSchema,
  SubmitReviewSchema,
  SubscriptionSchema,
  TransferSchema,
  UpdateBranchSchema,
  ViewedSchema,
} from '@duck-diff/protocol'
import { z } from 'zod'
import { HttpError } from './errors'
import type { GitHub } from './github'
import { readTemplates } from './templates'

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
  // Avatars are a nicety, so being signed out or offline answers with none rather than an error.
  if (area === 'notifications') {
    if (post) {
      await github.markRead(z.object({ id: z.string().nullable() }).parse(await body()).id)
      return new Response(null, { status: 204 })
    }
    return Response.json(await github.notifications(url.searchParams.get('all') === 'true'))
  }
  if (area === 'releases') {
    if (post) return Response.json(await github.createRelease(CreateReleaseSchema.parse(await body())), { status: 201 })
    return Response.json(await github.releases())
  }
  if (area === 'runs') {
    if (post) {
      const { runId, action: what } = RunActionSchema.parse(await body())
      await github.runAction(runId, what)
      return new Response(null, { status: 204 })
    }
    return Response.json(await github.runs())
  }
  if (area === 'rerun' && post) {
    await github.rerunFailed(RerunSchema.parse(await body()).runId)
    return new Response(null, { status: 204 })
  }
  if (area === 'job-log' && id !== undefined) {
    if (!Number.isInteger(number)) throw new HttpError(400, 'bad-request', 'bad job id')
    return new Response(await github.jobLog(number), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  if (area === 'templates') return Response.json(readTemplates(repo))
  if (area === 'options') return Response.json(await github.options())
  if (area === 'mentions') return Response.json(await github.mentions())
  if (area === 'references')
    return Response.json(
      await github.references(
        z
          .string()
          .max(100)
          .parse(url.searchParams.get('q') ?? ''),
      ),
    )
  if (area === 'react' && post) {
    const { target, content } = ReactSchema.parse(await body())
    await github.react(target, content)
    return new Response(null, { status: 204 })
  }
  if (area === 'comments' && id !== undefined) {
    if (!Number.isInteger(number)) throw new HttpError(400, 'bad-request', 'bad comment id')
    if (request.method === 'PATCH') {
      await github.editComment(number, PostCommentSchema.parse(await body()).body)
      return new Response(null, { status: 204 })
    }
    if (request.method === 'DELETE') {
      await github.deleteComment(number)
      return new Response(null, { status: 204 })
    }
  }
  if (area === 'threads' && id !== undefined) {
    if (!Number.isInteger(number)) throw new HttpError(400, 'bad-request', 'bad number')
    if (request.method === 'PATCH') {
      await github.editIssue(number, EditIssueSchema.parse(await body()))
      return new Response(null, { status: 204 })
    }
    if (action === 'lock' && post) {
      await github.setLocked(number, LockSchema.parse(await body()).locked)
      return new Response(null, { status: 204 })
    }
    if (action === 'extras') return Response.json(await github.extras(number))
    if (action === 'subscription' && post) {
      await github.setSubscribed(number, SubscriptionSchema.parse(await body()).subscribed)
      return new Response(null, { status: 204 })
    }
    if (action === 'pin' && post) {
      await github.setPinned(number, PinSchema.parse(await body()).pinned)
      return new Response(null, { status: 204 })
    }
    if (action === 'transfer' && post) {
      return Response.json(await github.transfer(number, TransferSchema.parse(await body()).repo))
    }
    return Response.json(await github.thread(number))
  }
  if (area === 'avatars') return Response.json(await github.avatars().catch(() => ({})))
  if (area === 'list')
    return Response.json(await github.list(ListQuerySchema.parse(Object.fromEntries(url.searchParams))))
  if (area === 'default-branch') return Response.json({ branch: await github.defaultBranch() })
  if (area === 'pulls') {
    if (id === undefined && post) {
      return Response.json(await github.createPull(CreatePullSchema.parse(await body())), { status: 201 })
    }
    if (id === undefined)
      return Response.json(await github.pulls(State.parse(Object.fromEntries(url.searchParams)).state))
    if (!Number.isInteger(number)) throw new HttpError(400, 'bad-request', 'bad pull request number')
    if (action === undefined) return Response.json(await github.pull(number))
    if (action === 'checks') return Response.json(await github.checks(number))
    if (action === 'commits') return Response.json(await github.pullCommits(number))
    if (action === 'update-branch' && post) {
      await github.updateBranch(number, UpdateBranchSchema.parse(await body()).method)
      return new Response(null, { status: 204 })
    }
    if (action === 'auto-merge' && post) {
      const { enabled, method } = AutoMergeSchema.parse(await body())
      await github.setAutoMerge(number, enabled, method)
      return new Response(null, { status: 204 })
    }
    if (action === 'branch' && post) {
      const { exists } = z.object({ exists: z.boolean() }).parse(await body())
      if (exists) await github.restoreHead(number)
      else await github.deleteHead(number)
      return new Response(null, { status: 204 })
    }
    if (action === 'base' && post) {
      await github.setBase(number, BaseSchema.parse(await body()).base)
      return new Response(null, { status: 204 })
    }
    if (action === 'suggestions' && post) {
      const { ids, message } = ApplySuggestionsSchema.parse(await body())
      await github.applySuggestions(number, ids, message)
      return new Response(null, { status: 204 })
    }
    if (action === 'merge-info') return Response.json(await github.mergeInfo(number))
    if (action === 'review-state') return Response.json(await github.reviewState(number))
    if (action === 'resolve' && post) {
      const { thread, resolved } = ResolveThreadSchema.parse(await body())
      await github.resolveThread(thread, resolved)
      return new Response(null, { status: 204 })
    }
    if (action === 'viewed' && post) {
      const { path, viewed } = ViewedSchema.parse(await body())
      await github.setViewed(number, path, viewed)
      return new Response(null, { status: 204 })
    }
    if (action === 'reviewers' && post) {
      await github.requestReviewers(number, ReviewersSchema.parse(await body()))
      return new Response(null, { status: 204 })
    }
    if (action === 'state' && post) {
      await github.setPullState(number, State.parse(await body()).state)
      return new Response(null, { status: 204 })
    }
    if (action === 'draft' && post) {
      await github.setDraft(number, DraftSchema.parse(await body()).draft)
      return new Response(null, { status: 204 })
    }
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
      const { event, body: text, comments } = SubmitReviewSchema.parse(await body())
      await github.submitReview(number, event, text, comments)
      return new Response(null, { status: 204 })
    }
    if (action === 'merge' && post) {
      await github.merge(number, MergePullSchema.parse(await body()))
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
        return Response.json(await github.createIssue(CreateIssueSchema.parse(await body())), { status: 201 })
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
