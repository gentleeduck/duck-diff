import {
  type BisectState,
  BisectStateSchema,
  type BlameLine,
  BlameLineSchema,
  type ChangedFile,
  ChangedFileSchema,
  type CheckRun,
  CheckRunSchema,
  type Commit,
  type CommitDetails,
  CommitDetailsSchema,
  CommitSchema,
  type CommitStat,
  CommitStatSchema,
  type ConflictFile,
  ConflictFileSchema,
  type ConversationComment,
  ConversationCommentSchema,
  type CreatePull,
  type CreateReview,
  type DiffTarget,
  type Discussion,
  DiscussionSchema,
  type DiscussionSummary,
  DiscussionSummarySchema,
  ErrorBodySchema,
  type ErrorCode,
  encodeTarget,
  type FileContents,
  FileContentsSchema,
  type GitHubReviewComment,
  GitHubReviewCommentSchema,
  type GitHubStatus,
  GitHubStatusSchema,
  type GitHubUser,
  GitHubUserSchema,
  type Insights,
  InsightsSchema,
  type IssueDetails,
  IssueDetailsSchema,
  type IssueSummary,
  IssueSummarySchema,
  type ItemExtras,
  ItemExtrasSchema,
  type Job,
  JobSchema,
  type ListPage,
  ListPageSchema,
  type ListQuery,
  type LspHover,
  LspHoverSchema,
  type LspLocations,
  LspLocationsSchema,
  type LspQuery,
  type MergeInfo,
  MergeInfoSchema,
  type MergeQueue,
  MergeQueueSchema,
  type Notification,
  NotificationSchema,
  type Options,
  OptionsSchema,
  type PendingComment,
  type PlanCommit,
  PlanCommitSchema,
  type PullCommit,
  PullCommitSchema,
  type PullDetails,
  PullDetailsSchema,
  type PullRefs,
  PullRefsSchema,
  type PullSummary,
  PullSummarySchema,
  type Reaction,
  type Ref,
  RefSchema,
  type Release,
  ReleaseSchema,
  type Remote,
  RemoteSchema,
  type RepoInfo,
  RepoInfoSchema,
  type ResolvedRevision,
  ResolvedRevisionSchema,
  type ReviewComment,
  ReviewCommentSchema,
  type ReviewState,
  ReviewStateSchema,
  type SecurityAlert,
  type SecurityAlerts,
  SecurityAlertsSchema,
  type Submodule,
  SubmoduleSchema,
  type SymbolResult,
  SymbolResultSchema,
  type SyncStatus,
  SyncStatusSchema,
  type Templates,
  TemplatesSchema,
  type Thread,
  ThreadSchema,
  type UndoResult,
  UndoResultSchema,
  type WorkflowRun,
  WorkflowRunSchema,
  type Worktree,
  WorktreeSchema,
  type WriteRequest,
} from '@duck-diff/protocol'
import { z } from 'zod'

function lspParams(query: LspQuery): URLSearchParams {
  const params = new URLSearchParams({ path: query.path, line: String(query.line), column: String(query.column) })
  if (query.ref) params.set('ref', query.ref)
  return params
}

const RepoEntrySchema = z.object({ path: z.string(), name: z.string(), current: z.boolean() })
export type RepoEntry = z.infer<typeof RepoEntrySchema>

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
  // What git makes of a typed revision: one commit, a range, or why it is neither.
  resolve(rev: string): Promise<ResolvedRevision>
  // grep finds commits by message, case aside.
  commits(query: { head: string; base?: string; limit?: number; path?: string; grep?: string }): Promise<Commit[]>
  diff(target: DiffTarget, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>
  content(target: DiffTarget, side: 'old' | 'new', file: Pick<ChangedFile, 'path' | 'oldPath'>): Promise<string | null>
  // Opens a file at a line in the best editor around; Neovim with none attached is left to the page to run.
  open(path: string, line: number): Promise<OpenResult>
  write(request: WriteRequest): Promise<void>
  undo(): Promise<UndoResult>
  reviews(target: DiffTarget): Promise<ReviewComment[]>
  // One comment (by id) or all of them, with the files, lines and code they are on, as text to give an AI.
  reviewPrompt(target: DiffTarget, id?: string): Promise<string>
  createReview(input: CreateReview): Promise<ReviewComment>
  updateReview(id: string, body: string): Promise<ReviewComment>
  deleteReview(id: string): Promise<void>
  graph(query: { all: boolean; limit: number }, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>
  commit(sha: string): Promise<CommitDetails>
  // Files and lines a commit changed, without listing them.
  commitStat(sha: string): Promise<CommitStat>
  // Without a ref these read the working tree.
  tree(ref?: string): Promise<string[]>
  file(path: string, ref?: string): Promise<FileContents>
  // The commits a rebase onto base replays, oldest first.
  rebasePlan(base: string): Promise<PlanCommit[]>
  // Contributors and weekly commits over the last days, from local history.
  insights(days: number): Promise<Insights>
  worktrees(): Promise<Worktree[]>
  submodules(): Promise<Submodule[]>
  // The commits a submodule pointer move brings in, newest first.
  submoduleLog(path: string, from: string | null, to: string): Promise<PlanCommit[]>
  // Repositories in the switcher, this one marked current; adding checks the folder is a repository.
  repos(): Promise<RepoEntry[]>
  addRepo(path: string): Promise<string>
  removeRepo(path: string): Promise<void>
  // Starts a server for a worktree or submodule and opens its page the way this one was opened; opened is
  // false when the server could not, and the page opens the url itself.
  openRepo(path: string): Promise<{ url: string; opened: boolean }>
  // Points Neovim's current tab at another checkout.
  tcd(path: string): Promise<void>
  bisect(): Promise<BisectState>
  // A conflicted file as blocks, with what each side had.
  conflict(path: string): Promise<ConflictFile>
  sync(): Promise<SyncStatus>
  remotes(): Promise<Remote[]>
  lastMessage(): Promise<string>
  blame(path: string, ref?: string, mergeBase?: string): Promise<BlameLine[]>
  // Where a name is defined and used; ref null searches the working tree.
  symbols(name: string, ref: string | null): Promise<SymbolResult>
  // Precise answers from a language server; source null means none handles the file.
  lsp: {
    definition(query: LspQuery): Promise<LspLocations>
    references(query: LspQuery): Promise<LspLocations>
    hover(query: LspQuery): Promise<LspHover>
    // Starts the language servers these files need, ahead of the first lookup.
    warm(paths: string[]): Promise<void>
  }
  git(action: GitAction, body?: unknown): Promise<{ sha?: string; conflicts?: boolean; stopped?: boolean }>
  // The actions run lately, newest first, and what one printed.
  jobs(): Promise<Job[]>
  jobOutput(id: string): Promise<string>
  clearJobs(): Promise<void>
  // Shells running on the server, which a reloaded page reattaches to.
  terminals(): Promise<{ id: string; title: string; cwd: string }[]>
  closeTerminal(id: string): Promise<void>
  // Empties what the server keeps on disk: GitHub answers, commits, the graph and the output history.
  clearCache(): Promise<void>
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
  // Search-backed list for both kinds, a page of 30 at a time.
  list(query: Partial<ListQuery> & Pick<ListQuery, 'kind'>): Promise<ListPage>
  createPull(input: Partial<CreatePull> & Omit<CreatePull, 'reviewers' | 'labels' | 'assignees'>): Promise<PullSummary>
  defaultBranch(): Promise<string>
  // email (lower case) -> avatar url; empty when signed out.
  avatars(): Promise<Record<string, string>>
  pull(number: number): Promise<PullDetails>
  // Description, timeline and what the viewer may edit, for a pull request or an issue.
  // GitLab numbers merge requests and issues apart, so the server is told which this is.
  thread(number: number, kind: 'pr' | 'issue'): Promise<Thread>
  editThread(
    number: number,
    input: { title?: string; body?: string; assignees?: string[]; labels?: string[]; milestone?: number | null },
  ): Promise<void>
  // Labels, open milestones and people who can be assigned or asked to review.
  options(): Promise<Options>
  requestReviewers(number: number, change: { add: string[]; remove: string[] }): Promise<void>
  setPullState(number: number, state: ItemState): Promise<void>
  setDraft(number: number, draft: boolean): Promise<void>
  setLocked(number: number, locked: boolean): Promise<void>
  extras(number: number): Promise<ItemExtras>
  setSubscribed(number: number, subscribed: boolean): Promise<void>
  applySuggestions(number: number, ids: number[], message: string): Promise<void>
  setPinned(number: number, pinned: boolean): Promise<void>
  // Moves an issue to another repo ("owner/name"), answering with where it landed.
  transfer(number: number, repo: string): Promise<{ number: number; url: string }>
  editComment(id: number, body: string): Promise<void>
  deleteComment(id: number): Promise<void>
  // A line comment in a pull request's diff.
  editReviewComment(id: number, body: string): Promise<void>
  deleteReviewComment(id: number): Promise<void>
  react(target: { issue: number } | { comment: number }, content: Reaction): Promise<void>
  mentions(): Promise<GitHubUser[]>
  references(query: string): Promise<{ number: number; title: string; pull: boolean }[]>
  checks(number: number): Promise<CheckRun[]>
  pullCommits(number: number): Promise<PullCommit[]>
  fetchPull(number: number): Promise<PullRefs>
  // Pull requests and issues share one conversation endpoint.
  comment(number: number, body: string): Promise<ConversationComment>
  reviewComment(
    number: number,
    input: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT' },
  ): Promise<GitHubReviewComment>
  reply(number: number, inReplyTo: number, body: string): Promise<GitHubReviewComment>
  review(number: number, event: ReviewEvent, body: string, comments?: PendingComment[]): Promise<void>
  reviewState(number: number): Promise<ReviewState>
  resolveThread(number: number, thread: string, resolved: boolean): Promise<void>
  setViewed(number: number, path: string, viewed: boolean): Promise<void>
  updateBranch(number: number, method?: 'merge' | 'rebase'): Promise<void>
  mergeInfo(number: number): Promise<MergeInfo>
  setAutoMerge(number: number, enabled: boolean, method: MergeMethod): Promise<void>
  // Deletes the head branch after a merge, or restores it.
  setHeadBranch(number: number, exists: boolean): Promise<void>
  setBase(number: number, base: string): Promise<void>
  rerunFailed(runId: number): Promise<void>
  notifications(all: boolean): Promise<Notification[]>
  // One thread, or every notification of this repo when null.
  markRead(id: string | null): Promise<void>
  releases(): Promise<Release[]>
  discussions(): Promise<DiscussionSummary[]>
  discussion(number: number): Promise<Discussion>
  replyDiscussion(number: number, body: string, replyTo?: string): Promise<void>
  markAnswer(comment: string, answer: boolean): Promise<void>
  security(): Promise<SecurityAlerts>
  dismissAlert(input: { kind: SecurityAlert['kind']; number: number; reason: string; comment?: string }): Promise<void>
  mergeQueue(number: number): Promise<MergeQueue>
  setQueued(number: number, queued: boolean): Promise<void>
  createRelease(input: {
    tag: string
    target: string
    name: string
    body: string
    draft: boolean
    prerelease: boolean
    generateNotes: boolean
  }): Promise<Release>
  runs(): Promise<WorkflowRun[]>
  runAction(runId: number, action: 'rerun' | 'rerun-failed' | 'cancel'): Promise<void>
  jobLog(jobId: number): Promise<string>
  merge(number: number, method: MergeMethod, commit?: { title?: string; message?: string; sha?: string }): Promise<void>
  issues(state: ItemState): Promise<IssueSummary[]>
  issue(number: number): Promise<IssueDetails>
  createIssue(input: { title: string; body: string; labels?: string[]; assignees?: string[] }): Promise<IssueSummary>
  // The repo's issue templates and pull request template, read from the checkout.
  templates(): Promise<Templates>
  setIssueState(number: number, state: ItemState, reason?: 'completed' | 'not_planned'): Promise<void>
}

export type GitAction =
  | 'commit'
  | 'push'
  | 'pull'
  | 'fetch'
  | 'switch'
  | 'checkout'
  | 'stash'
  | 'stash-apply'
  | 'stash-drop'
  | 'merge'
  | 'cherry-pick'
  | 'revert'
  | 'abort'
  | 'branch-delete'
  | 'stage-all'
  | 'unstage-all'
  | 'resolve'
  | 'mark-resolved'
  | 'resolve-text'
  | 'rebase-interactive'
  | 'fixup'
  | 'cherry-pick-range'
  | 'bisect-mark'
  | 'bisect-run'
  | 'bisect-reset'
  | 'worktree-add'
  | 'worktree-remove'
  | 'worktree-prune'
  | 'submodule-update'
  | 'submodule-sync'
  | 'undo-commit'
  | 'reset'
  | 'branch-rename'
  | 'set-upstream'
  | 'force-push'
  | 'remote-branch-delete'
  | 'track'
  | 'tag-create'
  | 'tag-delete'
  | 'tag-push'
  | 'remote-add'
  | 'remote-remove'
  | 'fetch-remote'
  | 'rebase'
  | 'continue'
  | 'skip'
  | 'clean'
  | 'stash-staged'

// How the server opened a file (server editor.ts), and with which command.
const OpenResultSchema = z.object({
  how: z.enum(['nvim', 'editor', 'system']),
  command: z.string().nullable().optional(),
})
export type OpenResult = z.infer<typeof OpenResultSchema>

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

  async function sendEmpty(method: string, path: string, body?: unknown): Promise<void> {
    await request(path, undefined, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
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
    thread: (number, kind) => json(`/api/github/threads/${number}?kind=${kind}`, ThreadSchema),
    editThread: (number, input) => sendEmpty('PATCH', `/api/github/threads/${number}`, input),
    options: () => json('/api/github/options', OptionsSchema),
    requestReviewers: (number, change) => post(`/api/github/pulls/${number}/reviewers`, change),
    setPullState: (number, state) => post(`/api/github/pulls/${number}/state`, { state }),
    setDraft: (number, draft) => post(`/api/github/pulls/${number}/draft`, { draft }),
    setLocked: (number, locked) => post(`/api/github/threads/${number}/lock`, { locked }),
    extras: (number) => json(`/api/github/threads/${number}/extras`, ItemExtrasSchema),
    setSubscribed: (number, subscribed) => post(`/api/github/threads/${number}/subscription`, { subscribed }),
    applySuggestions: (number, ids, message) => post(`/api/github/pulls/${number}/suggestions`, { ids, message }),
    setPinned: (number, pinned) => post(`/api/github/threads/${number}/pin`, { pinned }),
    transfer: (number, repo) =>
      send(
        'POST',
        `/api/github/threads/${number}/transfer`,
        { repo },
        z.object({ number: z.number(), url: z.string() }),
      ),
    editComment: (id, body) => sendEmpty('PATCH', `/api/github/comments/${id}`, { body }),
    deleteComment: (id) => sendEmpty('DELETE', `/api/github/comments/${id}`),
    editReviewComment: (id, body) => sendEmpty('PATCH', `/api/github/review-comments/${id}`, { body }),
    deleteReviewComment: (id) => sendEmpty('DELETE', `/api/github/review-comments/${id}`),
    react: (target, content) => post('/api/github/react', { target, content }),
    mentions: () => json('/api/github/mentions', z.array(GitHubUserSchema)),
    references: (query) =>
      json(
        `/api/github/references?q=${encodeURIComponent(query)}`,
        z.array(z.object({ number: z.number(), title: z.string(), pull: z.boolean() })),
      ),
    list(query) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query))
        if (value !== undefined && value !== '') params.set(key, String(value))
      return json(`/api/github/list?${params}`, ListPageSchema)
    },
    pullCommits: (number) => json(`/api/github/pulls/${number}/commits`, z.array(PullCommitSchema)),
    checks: (number) => json(`/api/github/pulls/${number}/checks`, z.array(CheckRunSchema)),
    createPull: (input) => send('POST', '/api/github/pulls', input, PullSummarySchema),
    avatars: () => json('/api/github/avatars', z.record(z.string(), z.string())),
    defaultBranch: async () => (await json('/api/github/default-branch', z.object({ branch: z.string() }))).branch,
    fetchPull: (number) => send('POST', `/api/github/pulls/${number}/fetch`, {}, PullRefsSchema),
    comment: (number, body) =>
      send('POST', `/api/github/issues/${number}/comments`, { body }, ConversationCommentSchema),
    reviewComment: (number, input) =>
      send('POST', `/api/github/pulls/${number}/review-comments`, input, GitHubReviewCommentSchema),
    reply: (number, inReplyTo, body) =>
      send('POST', `/api/github/pulls/${number}/replies`, { inReplyTo, body }, GitHubReviewCommentSchema),
    review: (number, event, body, comments = []) =>
      post(`/api/github/pulls/${number}/reviews`, { event, body, comments }),
    reviewState: (number) => json(`/api/github/pulls/${number}/review-state`, ReviewStateSchema),
    resolveThread: (number, thread, resolved) => post(`/api/github/pulls/${number}/resolve`, { thread, resolved }),
    setViewed: (number, path, viewed) => post(`/api/github/pulls/${number}/viewed`, { path, viewed }),
    updateBranch: (number, method = 'merge') => post(`/api/github/pulls/${number}/update-branch`, { method }),
    mergeInfo: (number) => json(`/api/github/pulls/${number}/merge-info`, MergeInfoSchema),
    setAutoMerge: (number, enabled, method) => post(`/api/github/pulls/${number}/auto-merge`, { enabled, method }),
    setHeadBranch: (number, exists) => post(`/api/github/pulls/${number}/branch`, { exists }),
    setBase: (number, base) => post(`/api/github/pulls/${number}/base`, { base }),
    rerunFailed: (runId) => post('/api/github/rerun', { runId }),
    notifications: (all) => json(`/api/github/notifications?all=${all}`, z.array(NotificationSchema)),
    markRead: (id) => post('/api/github/notifications', { id }),
    releases: () => json('/api/github/releases', z.array(ReleaseSchema)),
    discussions: () => json('/api/github/discussions', z.array(DiscussionSummarySchema)),
    discussion: (number) => json(`/api/github/discussions/${number}`, DiscussionSchema),
    replyDiscussion: (number, body, replyTo) =>
      sendEmpty('POST', `/api/github/discussions/${number}/reply`, replyTo ? { body, replyTo } : { body }),
    markAnswer: (comment, answer) => sendEmpty('POST', `/api/github/discussions/0/answer`, { comment, answer }),
    security: () => json('/api/github/security', SecurityAlertsSchema),
    dismissAlert: (input) => sendEmpty('POST', '/api/github/security', input),
    mergeQueue: (number) => json(`/api/github/pulls/${number}/queue`, MergeQueueSchema),
    setQueued: (number, queued) => sendEmpty('POST', `/api/github/pulls/${number}/queue`, { queued }),
    createRelease: (input) => send('POST', '/api/github/releases', input, ReleaseSchema),
    runs: () => json('/api/github/runs', z.array(WorkflowRunSchema)),
    runAction: (runId, action) => post('/api/github/runs', { runId, action }),
    jobLog: async (jobId) => (await request(`/api/github/job-log/${jobId}`)).text(),
    merge: (number, method, commit = {}) => post(`/api/github/pulls/${number}/merge`, { method, ...commit }),
    issues: (state) => json(`/api/github/issues?state=${state}`, z.array(IssueSummarySchema)),
    issue: (number) => json(`/api/github/issues/${number}`, IssueDetailsSchema),
    createIssue: (input) => send('POST', '/api/github/issues', input, IssueSummarySchema),
    templates: () => json('/api/github/templates', TemplatesSchema),
    setIssueState: (number, state, reason) => post(`/api/github/issues/${number}/state`, { state, reason }),
  }

  return {
    github,
    repo: () => json('/api/repo', RepoInfoSchema),
    refs: () => json('/api/refs', z.array(RefSchema)),
    files: (target, signal) => json(`/api/files?target=${encodeTarget(target)}`, z.array(ChangedFileSchema), signal),
    resolve: (rev) => json(`/api/resolve?${new URLSearchParams({ rev })}`, ResolvedRevisionSchema),
    commits(query) {
      const params = new URLSearchParams({ head: query.head })
      if (query.base) params.set('base', query.base)
      if (query.limit) params.set('limit', String(query.limit))
      if (query.path) params.set('path', query.path)
      if (query.grep) params.set('grep', query.grep)
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
    rebasePlan: (base) => json(`/api/rebase-plan?${new URLSearchParams({ base })}`, z.array(PlanCommitSchema)),
    bisect: () => json('/api/bisect', BisectStateSchema),
    insights: (days) => json(`/api/insights?days=${days}`, InsightsSchema),
    worktrees: () => json('/api/worktrees', z.array(WorktreeSchema)),
    submodules: () => json('/api/submodules', z.array(SubmoduleSchema)),
    submoduleLog(path, from, to) {
      const params = new URLSearchParams({ path, to })
      if (from) params.set('from', from)
      return json(`/api/submodule-log?${params}`, z.array(PlanCommitSchema))
    },
    repos: () => json('/api/repos', z.array(RepoEntrySchema)),
    async addRepo(path) {
      return (await send('POST', '/api/repos', { path }, z.object({ path: z.string() }))).path
    },
    removeRepo: (path) => sendEmpty('DELETE', `/api/repos?${new URLSearchParams({ path })}`),
    openRepo: (path) =>
      send('POST', '/api/open-repo', { path }, z.object({ url: z.string(), opened: z.boolean().default(false) })),
    async tcd(path) {
      await sendEmpty('POST', '/api/nvim/tcd', { path })
    },
    conflict: (path) => json(`/api/conflict?${new URLSearchParams({ path })}`, ConflictFileSchema),
    file(path, ref) {
      const params = new URLSearchParams({ path })
      if (ref) params.set('ref', ref)
      return json(`/api/file?${params}`, FileContentsSchema)
    },
    sync: () => json('/api/sync', SyncStatusSchema),
    remotes: () => json('/api/remotes', z.array(RemoteSchema)),
    lastMessage: async () => (await json('/api/last-message', z.object({ message: z.string() }))).message,
    symbols(name, ref) {
      const params = new URLSearchParams({ name })
      if (ref) params.set('ref', ref)
      return json(`/api/symbols?${params}`, SymbolResultSchema)
    },
    lsp: {
      definition: (query) => json(`/api/lsp/definition?${lspParams(query)}`, LspLocationsSchema),
      references: (query) => json(`/api/lsp/references?${lspParams(query)}`, LspLocationsSchema),
      hover: (query) => json(`/api/lsp/hover?${lspParams(query)}`, LspHoverSchema),
      warm: (paths) => post('/api/lsp/warm', { paths }),
    },
    blame(path, ref, mergeBase) {
      const params = new URLSearchParams({ path })
      if (ref) params.set('ref', ref)
      if (mergeBase) params.set('mergeBase', mergeBase)
      return json(`/api/blame?${params}`, z.array(BlameLineSchema))
    },
    git: (action, body) =>
      send(
        'POST',
        `/api/git/${action}`,
        body ?? {},
        z.object({ sha: z.string().optional(), conflicts: z.boolean().optional(), stopped: z.boolean().optional() }),
      ),
    jobs: () => json('/api/jobs', z.array(JobSchema)),
    clearJobs: () => sendEmpty('DELETE', '/api/jobs'),
    terminals: () => json('/api/terminals', z.array(z.object({ id: z.string(), title: z.string(), cwd: z.string() }))),
    clearCache: () => sendEmpty('POST', '/api/cache/clear'),
    closeTerminal: (id) => sendEmpty('DELETE', `/api/terminals/${encodeURIComponent(id)}`),
    jobOutput: async (id) => (await request(`/api/jobs/${encodeURIComponent(id)}/output`)).text(),
    commit: (sha) => json(`/api/commit?sha=${encodeURIComponent(sha)}`, CommitDetailsSchema),
    commitStat: (sha) => json(`/api/commit-stat?sha=${encodeURIComponent(sha)}`, CommitStatSchema),
    reviews: (target) => json(`/api/reviews?target=${encodeTarget(target)}`, z.array(ReviewCommentSchema)),
    reviewPrompt: async (target, id) =>
      (
        await request(`/api/reviews/prompt?target=${encodeTarget(target)}${id ? `&id=${encodeURIComponent(id)}` : ''}`)
      ).text(),
    createReview: (input) => send('POST', '/api/reviews', input, ReviewCommentSchema),
    updateReview: (id, body) => send('PATCH', `/api/reviews/${encodeURIComponent(id)}`, { body }, ReviewCommentSchema),
    async deleteReview(id) {
      await request(`/api/reviews/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' })
    },
    open: (path, line) => send('POST', '/api/open', { path, line }, OpenResultSchema),
  }
}
