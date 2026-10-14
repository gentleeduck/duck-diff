import {
  type ChangedFile,
  ChangedFileSchema,
  type Commit,
  type CommitDetails,
  CommitDetailsSchema,
  CommitSchema,
  type ConversationComment,
  ConversationCommentSchema,
  type CreateReview,
  type DiffTarget,
  ErrorBodySchema,
  type ErrorCode,
  encodeTarget,
  type FileContents,
  FileContentsSchema,
  type GitHubReviewComment,
  GitHubReviewCommentSchema,
  type GitHubStatus,
  GitHubStatusSchema,
  type IssueDetails,
  IssueDetailsSchema,
  type IssueSummary,
  IssueSummarySchema,
  type PullDetails,
  PullDetailsSchema,
  type PullRefs,
  PullRefsSchema,
  type PullSummary,
  PullSummarySchema,
  type Ref,
  RefSchema,
  type RepoInfo,
  RepoInfoSchema,
  type ReviewComment,
  ReviewCommentSchema,
  type SyncStatus,
  SyncStatusSchema,
  type UndoResult,
  UndoResultSchema,
  type WriteRequest,
} from '@duck-diff/protocol'
import { z } from 'zod'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface Api {
  repo(): Promise<RepoInfo>
  refs(): Promise<Ref[]>
  files(target: DiffTarget, signal?: AbortSignal): Promise<ChangedFile[]>
  commits(query: { head: string; base?: string; limit?: number; path?: string }): Promise<Commit[]>
  diff(target: DiffTarget, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>
  content(target: DiffTarget, side: 'old' | 'new', file: Pick<ChangedFile, 'path' | 'oldPath'>): Promise<string | null>
  open(path: string, line: number): Promise<void>
  write(request: WriteRequest): Promise<void>
  undo(): Promise<UndoResult>
  reviews(target: DiffTarget): Promise<ReviewComment[]>
  createReview(input: CreateReview): Promise<ReviewComment>
  updateReview(id: string, body: string): Promise<ReviewComment>
  deleteReview(id: string): Promise<void>
  graph(query: { all: boolean; limit: number }, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>
  commit(sha: string): Promise<CommitDetails>
  // Without a ref these read the working tree.
  tree(ref?: string): Promise<string[]>
  file(path: string, ref?: string): Promise<FileContents>
  sync(): Promise<SyncStatus>
  git(action: GitAction, body?: unknown): Promise<{ sha?: string }>
  github: GitHubApi
}

export type ItemState = 'open' | 'closed'
export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'
export type MergeMethod = 'merge' | 'squash' | 'rebase'

// Every GitHub call goes through the local server, which holds the token.
export interface GitHubApi {
  status(): Promise<GitHubStatus>
  signIn(token: string): Promise<GitHubStatus>
  pulls(state: ItemState): Promise<PullSummary[]>
  pull(number: number): Promise<PullDetails>
  fetchPull(number: number): Promise<PullRefs>
  // Pull requests and issues share one conversation endpoint.
  comment(number: number, body: string): Promise<ConversationComment>
  reviewComment(
    number: number,
    input: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT' },
  ): Promise<GitHubReviewComment>
  review(number: number, event: ReviewEvent, body: string): Promise<void>
  merge(number: number, method: MergeMethod): Promise<void>
  issues(state: ItemState): Promise<IssueSummary[]>
  issue(number: number): Promise<IssueDetails>
  createIssue(title: string, body: string): Promise<IssueSummary>
  setIssueState(number: number, state: ItemState): Promise<void>
}

export type GitAction = 'commit' | 'push' | 'pull' | 'fetch' | 'switch' | 'checkout'

const ContentSchema = z.object({ contents: z.string().nullable() })

export function createApi(fetcher: typeof fetch = fetch, base = ''): Api {
  async function request(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<Response> {
    const response = await fetcher(`${base}${path}`, { ...init, signal })
    if (response.ok) return response
    const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null))
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message)
    throw new ApiError(response.status, 'failed', `request failed with ${response.status}`)
  }

  async function json<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    return schema.parse(await (await request(path, signal)).json())
  }

  async function send<T>(method: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const response = await request(path, undefined, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return schema.parse(await response.json())
  }

  async function post(path: string, body: unknown): Promise<void> {
    await request(path, undefined, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const github: GitHubApi = {
    status: () => json('/api/github/status', GitHubStatusSchema),
    signIn: (token) => send('POST', '/api/github/token', { token }, GitHubStatusSchema),
    pulls: (state) => json(`/api/github/pulls?state=${state}`, z.array(PullSummarySchema)),
    pull: (number) => json(`/api/github/pulls/${number}`, PullDetailsSchema),
    fetchPull: (number) => send('POST', `/api/github/pulls/${number}/fetch`, {}, PullRefsSchema),
    comment: (number, body) =>
      send('POST', `/api/github/issues/${number}/comments`, { body }, ConversationCommentSchema),
    reviewComment: (number, input) =>
      send('POST', `/api/github/pulls/${number}/review-comments`, input, GitHubReviewCommentSchema),
    review: (number, event, body) => post(`/api/github/pulls/${number}/reviews`, { event, body }),
    merge: (number, method) => post(`/api/github/pulls/${number}/merge`, { method }),
    issues: (state) => json(`/api/github/issues?state=${state}`, z.array(IssueSummarySchema)),
    issue: (number) => json(`/api/github/issues/${number}`, IssueDetailsSchema),
    createIssue: (title, body) => send('POST', '/api/github/issues', { title, body }, IssueSummarySchema),
    setIssueState: (number, state) => post(`/api/github/issues/${number}/state`, { state }),
  }

  return {
    github,
    repo: () => json('/api/repo', RepoInfoSchema),
    refs: () => json('/api/refs', z.array(RefSchema)),
    files: (target, signal) => json(`/api/files?target=${encodeTarget(target)}`, z.array(ChangedFileSchema), signal),
    commits(query) {
      const params = new URLSearchParams({ head: query.head })
      if (query.base) params.set('base', query.base)
      if (query.limit) params.set('limit', String(query.limit))
      if (query.path) params.set('path', query.path)
      return json(`/api/commits?${params}`, z.array(CommitSchema))
    },
    async diff(target, signal) {
      const response = await request(`/api/diff?target=${encodeTarget(target)}`, signal)
      if (!response.body) throw new ApiError(500, 'failed', 'empty diff body')
      return response.body
    },
    async content(target, side, file) {
      const params = new URLSearchParams({ side, path: file.path })
      if (file.oldPath) params.set('oldPath', file.oldPath)
      const body = await json(`/api/content?target=${encodeTarget(target)}&${params}`, ContentSchema)
      return body.contents
    },
    async write(body) {
      await request('/api/write', undefined, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    async undo() {
      return UndoResultSchema.parse(await (await request('/api/undo', undefined, { method: 'POST' })).json())
    },
    async graph(query, signal) {
      const response = await request(`/api/graph?all=${query.all}&limit=${query.limit}`, signal)
      if (!response.body) throw new ApiError(500, 'failed', 'empty graph body')
      return response.body
    },
    tree: (ref) => json(`/api/tree${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`, z.array(z.string())),
    file(path, ref) {
      const params = new URLSearchParams({ path })
      if (ref) params.set('ref', ref)
      return json(`/api/file?${params}`, FileContentsSchema)
    },
    sync: () => json('/api/sync', SyncStatusSchema),
    git: (action, body) => send('POST', `/api/git/${action}`, body ?? {}, z.object({ sha: z.string().optional() })),
    commit: (sha) => json(`/api/commit?sha=${encodeURIComponent(sha)}`, CommitDetailsSchema),
    reviews: (target) => json(`/api/reviews?target=${encodeTarget(target)}`, z.array(ReviewCommentSchema)),
    createReview: (input) => send('POST', '/api/reviews', input, ReviewCommentSchema),
    updateReview: (id, body) => send('PATCH', `/api/reviews/${encodeURIComponent(id)}`, { body }, ReviewCommentSchema),
    async deleteReview(id) {
      await request(`/api/reviews/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' })
    },
    async open(path, line) {
      await request('/api/open', undefined, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, line }),
      })
    },
  }
}
