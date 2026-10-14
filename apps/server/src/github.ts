import { spawn } from 'node:child_process'
import { runGit } from '@duck-diff/git'
import type {
  ConversationComment,
  CreatePull,
  GitHubReviewComment,
  GitHubStatus,
  GitHubUser,
  IssueDetails,
  IssueSummary,
  PullDetails,
  PullSummary,
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
    const auth = await token()
    if (!auth) throw new HttpError(401, 'unauthorized', 'not signed in to GitHub')
    const response = await fetcher(`${apiBase}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${auth.token}`,
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      throw new HttpError(
        response.status === 404 ? 404 : 502,
        'failed',
        `GitHub: ${body?.message ?? response.statusText}`,
      )
    }
    return (response.status === 204 ? {} : await response.json()) as T
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
    async createPull(input: CreatePull): Promise<PullSummary> {
      return pullSummary(
        await call<RawPull>(`${await repoPath()}/pulls`, { method: 'POST', body: JSON.stringify(input) }),
      )
    },
    async defaultBranch(): Promise<string> {
      return (await call<{ default_branch: string }>(await repoPath())).default_branch
    },
    async pull(number: number): Promise<PullDetails> {
      const base = `${await repoPath()}`
      const [raw, comments, reviewComments] = await Promise.all([
        call<RawPullDetails>(`${base}/pulls/${number}`),
        call<RawComment[]>(`${base}/issues/${number}/comments?per_page=100`),
        call<RawReviewComment[]>(`${base}/pulls/${number}/comments?per_page=100`),
      ])
      return {
        ...pullSummary(raw),
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
      return { ...issueSummary(raw), body: raw.body ?? '', conversation: conversation.map(comment) }
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
  mergeable: boolean | null
  additions: number
  deletions: number
  changed_files: number
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
