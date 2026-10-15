import { spawn } from 'node:child_process'
import { runGit } from '@duck-diff/git'
import type {
  CheckRun,
  ConversationComment,
  CreatePull,
  GitHubReviewComment,
  GitHubStatus,
  GitHubUser,
  IssueDetails,
  IssueSummary,
  ListItem,
  ListPage,
  ListQuery,
  Options,
  PullCommit,
  PullDetails,
  PullSummary,
  Reviewer,
  Thread,
  TimelineEvent,
} from '@duck-diff/protocol'
import { HttpError } from './errors'

export interface GitHubOptions {
  fetch?: typeof fetch
  // Where the token comes from when the page has not supplied one; tests replace it.
  findToken?: () => Promise<{ token: string; source: 'env' | 'gh' } | null>
  apiBase?: string
}

// owner/name from git@github.com:owner/name.git, https://github.com/owner/name and ssh://git@github.com/owner/name.
export function parseGitHubRemote(url: string): string | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())
  return match ? `${match[1]}/${match[2]}` : null
}

function runGh(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('gh', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk
    })
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  })
}

async function defaultFindToken() {
  const env = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  if (env) return { token: env, source: 'env' as const }
  const token = await runGh(['auth', 'token'])
  return token ? { token, source: 'gh' as const } : null
}

interface RawUser {
  login: string
  avatar_url: string
}
interface RawLabel {
  name: string
  color: string
}
interface RawComment {
  id: number
  user: RawUser | null
  body: string | null
  created_at: string
}

const user = (raw: RawUser | null): GitHubUser => ({ login: raw?.login ?? 'ghost', avatarUrl: raw?.avatar_url ?? '' })
const labels = (raw: RawLabel[] | undefined) => (raw ?? []).map(({ name, color }) => ({ name, color }))
const comment = (raw: RawComment): ConversationComment => ({
  id: raw.id,
  author: user(raw.user),
  body: raw.body ?? '',
  createdAt: raw.created_at,
})

export function createGitHub(repo: string, options: GitHubOptions = {}) {
  const fetcher = options.fetch ?? fetch
  const findToken = options.findToken ?? defaultFindToken
  const apiBase = options.apiBase ?? 'https://api.github.com'
  let pasted: string | null = null
  let avatarMap: Promise<Record<string, string>> | null = null
  let mentionList: Promise<GitHubUser[]> | null = null
  const etags = new Map<string, { etag: string; body: unknown }>()
  // Bounded, oldest out first: a long session reads many pages.
  const remember = (key: string, etag: string, body: unknown) => {
    etags.delete(key)
    etags.set(key, { etag, body })
    if (etags.size > 300) etags.delete(etags.keys().next().value as string)
  }

  async function pagesOf<T>(path: string, pages: number, init: RequestInit = {}): Promise<T[]> {
    const all: T[] = []
    for (let page = 1; page <= pages; page++) {
      const batch = await call<T[]>(`${path}?per_page=100&page=${page}`, init)
      all.push(...batch)
      if (batch.length < 100) break
    }
    return all
  }
  let slug: Promise<string | null> | null = null

  const repoSlug = () => {
    slug ??= runGit(['remote', 'get-url', 'origin'], { cwd: repo }).then(parseGitHubRemote, () => null)
    return slug
  }

  async function token(): Promise<{ token: string; source: GitHubStatus['source'] } | null> {
    if (pasted) return { token: pasted, source: 'token' }
    return findToken()
  }

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await send<T>(path, init)).body
  }

  // The status matters for reactions: GitHub answers 200 when the reaction already exists.
  async function send<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const auth = await token()
    // Reads remember GitHub's ETag; asking again with it costs no rate limit when nothing changed.
    const read = !init.method || init.method === 'GET'
    const key = `${path} ${JSON.stringify(init.headers ?? {})}`
    const cached = read ? etags.get(key) : undefined
    if (!auth) throw new HttpError(401, 'unauthorized', 'not signed in to GitHub')
    const response = await fetcher(`${apiBase}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${auth.token}`,
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
        ...(cached ? { 'if-none-match': cached.etag } : {}),
      },
    })
    if (response.status === 304 && cached) return { status: 200, body: cached.body as T }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      throw new HttpError(
        response.status === 404 ? 404 : 502,
        'failed',
        `GitHub: ${body?.message ?? response.statusText}`,
      )
    }
    const text = await response.text()
    const body = (text ? JSON.parse(text) : {}) as T
    const etag = response.headers.get('etag')
    if (read && etag) remember(key, etag, body)
    // A write changes what later reads see, so cached answers are dropped.
    if (!read) etags.clear()
    return { status: response.status, body }
  }

  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await call<{ data?: T; errors?: { message: string }[] }>('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    })
    if (result.errors?.length || !result.data) {
      throw new HttpError(502, 'failed', `GitHub: ${result.errors?.[0]?.message ?? 'empty answer'}`)
    }
    return result.data
  }

  async function repoPath(): Promise<string> {
    const name = await repoSlug()
    if (!name) throw new HttpError(409, 'bad-request', 'this repository has no GitHub remote named origin')
    return `/repos/${name}`
  }

  return {
    async status(): Promise<GitHubStatus> {
      const [name, auth] = await Promise.all([repoSlug(), token()])
      if (!auth) return { repo: name, user: null, source: null }
      const me = await call<RawUser>('/user').catch(() => null)
      return { repo: name, user: me ? user(me) : null, source: me ? auth.source : null }
    },
    setToken(next: string) {
      pasted = next
    },
    async pulls(state: 'open' | 'closed'): Promise<PullSummary[]> {
      const raw = await call<RawPull[]>(
        `${await repoPath()}/pulls?state=${state}&per_page=50&sort=updated&direction=desc`,
      )
      return raw.map(pullSummary)
    },
    async list(input: ListQuery): Promise<ListPage> {
      const name = await repoSlug()
      if (!name) throw new HttpError(409, 'bad-request', 'this repository has no GitHub remote named origin')
      const q = [
        `repo:${name}`,
        input.kind === 'pr' ? 'is:pr' : 'is:issue',
        `is:${input.state}`,
        FILTERS[input.filter],
        `sort:${input.sort}-desc`,
        input.query,
      ]
        .filter(Boolean)
        .join(' ')
      const data = await graphql<RawSearch>(SEARCH, { q, after: input.after ?? null })
      return {
        items: data.search.nodes.filter((node) => node.number !== undefined).map(listItem),
        total: data.search.issueCount,
        cursor: data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null,
      }
    },
    async thread(number: number): Promise<Thread> {
      const base = await repoPath()
      const [issue, timeline, me, repoInfo] = await Promise.all([
        call<RawThreadIssue>(`${base}/issues/${number}`, FULL),
        pagesOf<RawTimeline>(`${base}/issues/${number}/timeline`, 3, FULL),
        call<RawUser>('/user'),
        call<{ permissions?: { push?: boolean } }>(base),
      ])
      return {
        number: issue.number,
        title: issue.title,
        body: issue.body ?? '',
        html: issue.body_html ?? null,
        author: user(issue.user),
        createdAt: issue.created_at,
        edited: issue.updated_at !== issue.created_at && Boolean(issue.body),
        reactions: reactions(issue.reactions),
        timeline: timeline.flatMap(timelineEvent),
        viewer: { login: me.login, canEdit: Boolean(repoInfo.permissions?.push) || issue.user?.login === me.login },
      }
    },
    async options(): Promise<Options> {
      const base = await repoPath()
      const [labels, milestones, people] = await Promise.all([
        pagesOf<{ name: string; color: string; description: string | null }>(`${base}/labels`, 3),
        call<{ number: number; title: string }[]>(`${base}/milestones?state=open&per_page=100`),
        this.mentions(),
      ])
      return {
        labels: labels.map((label) => ({ name: label.name, color: label.color, description: label.description ?? '' })),
        milestones: milestones.map((milestone) => ({ number: milestone.number, title: milestone.title })),
        people,
      }
    },
    async requestReviewers(number: number, input: { add: string[]; remove: string[] }): Promise<void> {
      const path = `${await repoPath()}/pulls/${number}/requested_reviewers`
      if (input.add.length) await call(path, { method: 'POST', body: JSON.stringify({ reviewers: input.add }) })
      if (input.remove.length) await call(path, { method: 'DELETE', body: JSON.stringify({ reviewers: input.remove }) })
    },
    async setPullState(number: number, state: 'open' | 'closed'): Promise<void> {
      await call(`${await repoPath()}/pulls/${number}`, { method: 'PATCH', body: JSON.stringify({ state }) })
    },
    // REST cannot switch draft state; GitHub's GraphQL mutations take the pull request's node id.
    async setDraft(number: number, draft: boolean): Promise<void> {
      const { nodeId } = await this.pull(number)
      const mutation = draft
        ? 'mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }'
        : 'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }'
      await graphql(mutation, { id: nodeId })
    },
    async setLocked(number: number, locked: boolean): Promise<void> {
      await call(`${await repoPath()}/issues/${number}/lock`, { method: locked ? 'PUT' : 'DELETE' })
    },
    async editIssue(
      number: number,
      input: { title?: string; body?: string; assignees?: string[]; labels?: string[]; milestone?: number | null },
    ): Promise<void> {
      await call(`${await repoPath()}/issues/${number}`, { method: 'PATCH', body: JSON.stringify(input) })
    },
    async editComment(id: number, body: string): Promise<void> {
      await call(`${await repoPath()}/issues/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) })
    },
    async deleteComment(id: number): Promise<void> {
      await call(`${await repoPath()}/issues/comments/${id}`, { method: 'DELETE' })
    },
    // Adding a reaction you already gave returns it with 200; then it is taken back instead.
    async react(target: { issue: number } | { comment: number }, content: string): Promise<void> {
      const base = await repoPath()
      const path =
        'issue' in target
          ? `${base}/issues/${target.issue}/reactions`
          : `${base}/issues/comments/${target.comment}/reactions`
      const { status, body } = await send<{ id: number }>(path, { method: 'POST', body: JSON.stringify({ content }) })
      if (status === 200) await call(`${path}/${body.id}`, { method: 'DELETE' })
    },
    async mentions(): Promise<GitHubUser[]> {
      mentionList ??= (async () =>
        (await call<RawUser[]>(`${await repoPath()}/assignees?per_page=100`)).map(user))().catch((error) => {
        mentionList = null
        throw error
      })
      return mentionList
    },
    async references(query: string): Promise<{ number: number; title: string; pull: boolean }[]> {
      const name = await repoSlug()
      const q = encodeURIComponent(`repo:${name} ${query}`)
      const found = await call<{ items: RawIssue[] }>(`/search/issues?q=${q}&per_page=8&sort=updated`)
      return found.items.map((item) => ({ number: item.number, title: item.title, pull: Boolean(item.pull_request) }))
    },
    async createPull(input: CreatePull): Promise<PullSummary> {
      return pullSummary(
        await call<RawPull>(`${await repoPath()}/pulls`, { method: 'POST', body: JSON.stringify(input) }),
      )
    },
    async defaultBranch(): Promise<string> {
      return (await call<{ default_branch: string }>(await repoPath())).default_branch
    },
    // email -> avatar url from the latest commits GitHub knows, read once; unknown authors get initials.
    avatars(): Promise<Record<string, string>> {
      avatarMap ??= (async () => {
        const base = await repoPath()
        const pages = await Promise.all(
          [1, 2, 3].map((page) =>
            call<RawCommit[]>(`${base}/commits?per_page=100&page=${page}`).catch(() => [] as RawCommit[]),
          ),
        )
        const map: Record<string, string> = {}
        for (const commit of pages.flat()) {
          const email = commit.commit.author?.email?.toLowerCase()
          if (email && commit.author?.avatar_url) map[email] ??= commit.author.avatar_url
        }
        return map
      })().catch((error) => {
        avatarMap = null
        throw error
      })
      return avatarMap
    },
    async checks(number: number): Promise<CheckRun[]> {
      const base = await repoPath()
      const { head } = await call<RawPull>(`${base}/pulls/${number}`)
      const { check_runs } = await call<{ check_runs: RawCheckRun[] }>(
        `${base}/commits/${head.sha}/check-runs?per_page=100`,
      )
      return check_runs.map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url ?? '',
      }))
    },
    async pull(number: number): Promise<PullDetails> {
      const base = `${await repoPath()}`
      const [raw, comments, reviewComments, reviews] = await Promise.all([
        call<RawPullDetails>(`${base}/pulls/${number}`),
        call<RawComment[]>(`${base}/issues/${number}/comments?per_page=100`),
        call<RawReviewComment[]>(`${base}/pulls/${number}/comments?per_page=100`),
        call<{ user: RawUser | null; state: Reviewer['state'] }[]>(`${base}/pulls/${number}/reviews?per_page=100`),
      ])
      // Each person's latest review counts; anyone requested and not yet reviewing is listed as waiting.
      const latest = new Map<string, Reviewer>()
      for (const review of reviews) {
        if (!review.user || (review.state === 'COMMENTED' && latest.has(review.user.login))) continue
        latest.set(review.user.login, { ...user(review.user), state: review.state })
      }
      for (const requested of raw.requested_reviewers ?? []) {
        latest.set(requested.login, { ...user(requested), state: null })
      }
      return {
        ...pullSummary(raw),
        commits: raw.commits,
        assignees: (raw.assignees ?? []).map(user),
        milestone: raw.milestone?.title ?? null,
        reviewers: [...latest.values()],
        mergeableState: raw.mergeable_state ?? 'unknown',
        nodeId: raw.node_id,
        locked: raw.locked ?? false,
        body: raw.body ?? '',
        headSha: raw.head.sha,
        baseSha: raw.base.sha,
        mergeable: raw.mergeable,
        additions: raw.additions,
        deletions: raw.deletions,
        changedFiles: raw.changed_files,
        comments: comments.map(comment),
        reviewComments: reviewComments.map(reviewComment),
      }
    },
    async pullCommits(number: number): Promise<PullCommit[]> {
      const raw = await pagesOf<{
        sha: string
        commit: { message: string; author: { name: string; date: string } | null }
        author: RawUser | null
      }>(`${await repoPath()}/pulls/${number}/commits`, 3)
      return raw.map((entry) => ({
        sha: entry.sha,
        message: entry.commit.message,
        author: user(entry.author),
        authorName: entry.commit.author?.name ?? '',
        date: entry.commit.author?.date ?? '',
      }))
    },
    async commentOn(number: number, body: string): Promise<ConversationComment> {
      return comment(
        await call<RawComment>(`${await repoPath()}/issues/${number}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      )
    },
    async reviewComment(
      number: number,
      input: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT'; commitId: string },
    ): Promise<GitHubReviewComment> {
      return reviewComment(
        await call<RawReviewComment>(`${await repoPath()}/pulls/${number}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            body: input.body,
            path: input.path,
            line: input.line,
            side: input.side,
            commit_id: input.commitId,
          }),
        }),
      )
    },
    async reply(number: number, inReplyTo: number, body: string): Promise<GitHubReviewComment> {
      return reviewComment(
        await call<RawReviewComment>(`${await repoPath()}/pulls/${number}/comments/${inReplyTo}/replies`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      )
    },
    async submitReview(number: number, event: string, body: string): Promise<void> {
      await call(`${await repoPath()}/pulls/${number}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ event, body: body || undefined }),
      })
    },
    async merge(number: number, method: string): Promise<void> {
      await call(`${await repoPath()}/pulls/${number}/merge`, {
        method: 'PUT',
        body: JSON.stringify({ merge_method: method }),
      })
    },
    async issues(state: 'open' | 'closed'): Promise<IssueSummary[]> {
      const raw = await call<RawIssue[]>(`${await repoPath()}/issues?state=${state}&per_page=50&sort=updated`)
      // The issues endpoint also returns pull requests; they have their own view.
      return raw.filter((issue) => !issue.pull_request).map(issueSummary)
    },
    async issue(number: number): Promise<IssueDetails> {
      const base = await repoPath()
      const [raw, conversation] = await Promise.all([
        call<RawIssue>(`${base}/issues/${number}`),
        call<RawComment[]>(`${base}/issues/${number}/comments?per_page=100`),
      ])
      return {
        ...issueSummary(raw),
        locked: raw.locked ?? false,
        assignees: (raw.assignees ?? []).map(user),
        milestone: raw.milestone?.title ?? null,
        body: raw.body ?? '',
        conversation: conversation.map(comment),
      }
    },
    async createIssue(title: string, body: string): Promise<IssueSummary> {
      return issueSummary(
        await call<RawIssue>(`${await repoPath()}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) }),
      )
    },
    async setIssueState(number: number, state: 'open' | 'closed'): Promise<void> {
      await call(`${await repoPath()}/issues/${number}`, { method: 'PATCH', body: JSON.stringify({ state }) })
    },
  }
}

export type GitHub = ReturnType<typeof createGitHub>

interface RawPull {
  number: number
  title: string
  state: 'open' | 'closed'
  merged_at: string | null
  draft?: boolean
  user: RawUser | null
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  created_at: string
  updated_at: string
  labels?: RawLabel[]
  html_url: string
}
interface RawPullDetails extends RawPull {
  body: string | null
  node_id: string
  locked?: boolean
  commits: number
  requested_reviewers?: RawUser[]
  assignees?: RawUser[]
  milestone?: { title: string } | null
  mergeable_state?: string
  mergeable: boolean | null
  additions: number
  deletions: number
  changed_files: number
}
interface RawCommit {
  commit: { author: { email: string } | null }
  author: RawUser | null
}
interface RawCheckRun {
  name: string
  status: CheckRun['status']
  conclusion: CheckRun['conclusion']
  html_url: string | null
}
interface RawReviewComment extends RawComment {
  path: string
  line: number | null
  side?: 'LEFT' | 'RIGHT'
  in_reply_to_id?: number
}
interface RawIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  user: RawUser | null
  created_at: string
  updated_at: string
  labels?: RawLabel[]
  comments: number
  html_url: string
  body?: string | null
  pull_request?: unknown
  assignees?: RawUser[]
  milestone?: { title: string } | null
  locked?: boolean
}

function pullSummary(raw: RawPull): PullSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    merged: raw.merged_at !== null,
    draft: raw.draft ?? false,
    author: user(raw.user),
    headRef: raw.head.ref,
    baseRef: raw.base.ref,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    labels: labels(raw.labels),
    url: raw.html_url,
  }
}

function reviewComment(raw: RawReviewComment): GitHubReviewComment {
  return {
    ...comment(raw),
    path: raw.path,
    line: raw.line,
    side: raw.side ?? 'RIGHT',
    inReplyTo: raw.in_reply_to_id ?? null,
  }
}

function issueSummary(raw: RawIssue): IssueSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: user(raw.user),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    labels: labels(raw.labels),
    comments: raw.comments,
    url: raw.html_url,
  }
}

const FILTERS: Record<ListQuery['filter'], string> = {
  all: '',
  mine: 'author:@me',
  'review-requested': 'review-requested:@me',
  assigned: 'assignee:@me',
  mentioned: 'mentions:@me',
}

// One search returns everything a list row shows, review state and CI included, in one request.
const SEARCH = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 30, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        number title state url updatedAt
        author { login avatarUrl }
        labels(first: 10) { nodes { name color } }
        comments { totalCount }
        assignees(first: 5) { nodes { login avatarUrl } }
        milestone { title }
      }
      ... on PullRequest {
        number title state url updatedAt isDraft merged reviewDecision
        author { login avatarUrl }
        labels(first: 10) { nodes { name color } }
        comments { totalCount }
        assignees(first: 5) { nodes { login avatarUrl } }
        milestone { title }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`

interface RawNode {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  url: string
  updatedAt: string
  isDraft?: boolean
  merged?: boolean
  reviewDecision?: ListItem['review']
  author: { login: string; avatarUrl: string } | null
  labels: { nodes: { name: string; color: string }[] }
  comments: { totalCount: number }
  assignees: { nodes: { login: string; avatarUrl: string }[] }
  milestone: { title: string } | null
  commits?: { nodes: { commit: { statusCheckRollup: { state: NonNullable<ListItem['checks']> } | null } }[] }
}
interface RawSearch {
  search: { issueCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawNode[] }
}

function listItem(node: RawNode): ListItem {
  return {
    number: node.number,
    title: node.title,
    state: node.state === 'OPEN' ? 'open' : 'closed',
    merged: node.merged ?? node.state === 'MERGED',
    draft: node.isDraft ?? false,
    author: { login: node.author?.login ?? 'ghost', avatarUrl: node.author?.avatarUrl ?? '' },
    labels: node.labels.nodes,
    comments: node.comments.totalCount,
    assignees: node.assignees.nodes.map((entry) => ({ login: entry.login, avatarUrl: entry.avatarUrl })),
    milestone: node.milestone?.title ?? null,
    updatedAt: node.updatedAt,
    url: node.url,
    review: node.reviewDecision ?? null,
    checks: node.commits?.nodes[0]?.commit.statusCheckRollup?.state ?? null,
  }
}

interface RawReactions {
  [key: string]: number | string
}
// Asks GitHub to render bodies too, so comments show exactly as on github.com (bot HTML, mentions, emoji).
const FULL: RequestInit = { headers: { accept: 'application/vnd.github.full+json' } }

interface RawThreadIssue {
  number: number
  title: string
  body: string | null
  body_html?: string
  user: RawUser | null
  created_at: string
  updated_at: string
  reactions?: RawReactions
}
interface RawTimeline {
  event: string
  id?: number
  node_id?: string
  actor?: RawUser | null
  user?: RawUser | null
  created_at?: string
  updated_at?: string
  submitted_at?: string
  body?: string | null
  body_html?: string
  html_url?: string
  state?: string
  reactions?: RawReactions
  sha?: string
  message?: string
  author?: { name: string; date: string }
  label?: { name: string }
  rename?: { from: string; to: string }
  assignee?: RawUser
  requested_reviewer?: RawUser
  requested_team?: { name: string }
  milestone?: { title: string }
  commit_id?: string
  source?: { issue?: { number: number; title: string } }
}

const REACTION_KEYS = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'] as const

function reactions(raw: RawReactions | undefined): Partial<Record<(typeof REACTION_KEYS)[number], number>> {
  const counts: Partial<Record<(typeof REACTION_KEYS)[number], number>> = {}
  for (const key of REACTION_KEYS) {
    const count = Number(raw?.[key] ?? 0)
    if (count) counts[key] = count
  }
  return counts
}

const EVENT_TEXT: Record<string, (raw: RawTimeline) => string | null> = {
  labeled: (raw) => `added the ${raw.label?.name} label`,
  unlabeled: (raw) => `removed the ${raw.label?.name} label`,
  renamed: (raw) => `changed the title from "${raw.rename?.from}" to "${raw.rename?.to}"`,
  closed: () => 'closed this',
  reopened: () => 'reopened this',
  merged: (raw) => `merged commit ${raw.commit_id?.slice(0, 7)}`,
  assigned: (raw) => `assigned ${raw.assignee?.login}`,
  unassigned: (raw) => `unassigned ${raw.assignee?.login}`,
  review_requested: (raw) => `requested a review from ${raw.requested_reviewer?.login ?? raw.requested_team?.name}`,
  review_request_removed: (raw) =>
    `removed the review request for ${raw.requested_reviewer?.login ?? raw.requested_team?.name}`,
  milestoned: (raw) => `added this to the ${raw.milestone?.title} milestone`,
  demilestoned: (raw) => `removed this from the ${raw.milestone?.title} milestone`,
  'cross-referenced': (raw) =>
    raw.source?.issue ? `mentioned this in #${raw.source.issue.number} ${raw.source.issue.title}` : null,
  referenced: (raw) => (raw.commit_id ? `referenced this in commit ${raw.commit_id.slice(0, 7)}` : null),
  head_ref_force_pushed: () => 'force-pushed the branch',
  head_ref_deleted: () => 'deleted the branch',
  head_ref_restored: () => 'restored the branch',
  convert_to_draft: () => 'marked this as a draft',
  ready_for_review: () => 'marked this ready for review',
  locked: () => 'locked the conversation',
  unlocked: () => 'unlocked the conversation',
}

// GitHub's timeline mixes many shapes; each becomes one of four the page draws, the rest are dropped.
function timelineEvent(raw: RawTimeline): TimelineEvent[] {
  if (raw.event === 'commented' && raw.id) {
    return [
      {
        kind: 'comment',
        id: raw.id,
        author: user(raw.user ?? raw.actor ?? null),
        body: raw.body ?? '',
        html: raw.body_html ?? null,
        createdAt: raw.created_at ?? '',
        edited: Boolean(raw.updated_at && raw.updated_at !== raw.created_at),
        reactions: reactions(raw.reactions),
        url: raw.html_url ?? '',
      },
    ]
  }
  if (raw.event === 'reviewed' && raw.id) {
    return [
      {
        kind: 'review',
        id: raw.id,
        author: user(raw.user ?? null),
        state: raw.state ?? '',
        body: raw.body ?? '',
        html: raw.body_html ?? null,
        createdAt: raw.submitted_at ?? '',
      },
    ]
  }
  if (raw.event === 'committed' && raw.sha) {
    return [
      {
        kind: 'commit',
        sha: raw.sha,
        message: raw.message ?? '',
        author: raw.author?.name ?? '',
        createdAt: raw.author?.date ?? '',
      },
    ]
  }
  const text = EVENT_TEXT[raw.event]?.(raw)
  if (!text) return []
  return [
    {
      kind: 'event',
      id: raw.node_id ?? `${raw.event}:${raw.created_at}`,
      event: raw.event,
      actor: user(raw.actor ?? null),
      text,
      createdAt: raw.created_at ?? '',
    },
  ]
}
