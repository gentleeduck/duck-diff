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
  ItemExtras,
  LinkedItem,
  ListItem,
  ListPage,
  ListQuery,
  MergeInfo,
  Notification,
  Options,
  PendingComment,
  PullCommit,
  PullDetails,
  PullSummary,
  Release,
  Reviewer,
  ReviewState,
  Thread,
  TimelineEvent,
  WorkflowRun,
} from '@duck-diff/protocol'
import { HttpError } from './errors'
import { apiBases, parseRemote, type RemoteHost } from './forge-host'
import { applyEdits, type SuggestionEdit, suggestionLines } from './suggestions'

interface RawItemTime {
  updatedAt: string
  commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] }
}

export interface GitHubOptions {
  fetch?: typeof fetch
  // Where the token comes from when the page has not supplied one, by host; tests replace it.
  findToken?: (host: string) => Promise<{ token: string; source: 'env' | 'gh' } | null>
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

// github.com reads GH_TOKEN and gh's default login; an Enterprise host its own variables and gh login.
async function defaultFindToken(host = 'github.com') {
  const env =
    host === 'github.com'
      ? (process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN)
      : (process.env.GH_ENTERPRISE_TOKEN ?? process.env.GITHUB_ENTERPRISE_TOKEN)
  if (env) return { token: env, source: 'env' as const }
  const token = await runGh(host === 'github.com' ? ['auth', 'token'] : ['auth', 'token', '--hostname', host])
  return token ? { token, source: 'gh' as const } : null
}

// origin's host and path, with `git config duck-diff.forge` deciding the kind for an unusual host name.
export async function readRemote(repo: string): Promise<RemoteHost | null> {
  const [url, configured] = await Promise.all([
    runGit(['remote', 'get-url', 'origin'], { cwd: repo }).catch(() => ''),
    runGit(['config', '--get', 'duck-diff.forge'], { cwd: repo, okExitCodes: [1] }).catch(() => ''),
  ])
  return url.trim() ? parseRemote(url, configured.trim() || null) : null
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
  let remote: Promise<RemoteHost | null> | null = null
  const origin = () => {
    remote ??= readRemote(repo)
    return remote
  }
  // Enterprise servers answer under /api/v3 and /api/graphql on their own host.
  const bases = async () => {
    if (options.apiBase) return { rest: options.apiBase, graphql: `${options.apiBase}/graphql` }
    const found = await origin()
    return found?.kind === 'github' ? apiBases(found) : apiBases({ kind: 'github', host: 'github.com', slug: '' })
  }
  const urlFor = async (path: string) => {
    const { rest, graphql } = await bases()
    return path === '/graphql' ? graphql : `${rest}${path}`
  }
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
    slug ??= origin().then((found) => (found?.kind === 'github' ? found.slug : null))
    return slug
  }

  // Finding the token can mean running `gh auth token`, so it is looked up once and kept until GitHub
  // refuses it.
  let found: Promise<{ token: string; source: GitHubStatus['source'] } | null> | null = null
  async function token(): Promise<{ token: string; source: GitHubStatus['source'] } | null> {
    if (pasted) return { token: pasted, source: 'token' }
    found ??= origin()
      .then((at) => findToken(at?.kind === 'github' ? at.host : 'github.com'))
      .then((result) => {
        if (!result) found = null
        return result
      })
    return found
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
    const response = await fetcher(await urlFor(path), {
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
    if (response.status === 401) found = null
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

  async function ownerAndName(): Promise<[string, string]> {
    const name = await repoSlug()
    if (!name) throw new HttpError(409, 'bad-request', 'this repository has no GitHub remote named origin')
    return name.split('/') as [string, string]
  }

  async function nodeIdOf(number: number): Promise<string> {
    const [owner, name] = await ownerAndName()
    const data = await graphql<{ repository: { issueOrPullRequest: { id: string } | null } }>(
      'query($owner: String!, $repo: String!, $number: Int!) { repository(owner: $owner, name: $repo) { issueOrPullRequest(number: $number) { ... on Issue { id } ... on PullRequest { id } } } }',
      { owner, repo: name, number },
    )
    const id = data.repository.issueOrPullRequest?.id
    if (!id) throw new HttpError(404, 'not-found', `no issue or pull request #${number}`)
    return id
  }

  async function repoPath(): Promise<string> {
    const name = await repoSlug()
    if (!name) throw new HttpError(409, 'bad-request', 'this repository has no GitHub remote named origin')
    return `/repos/${name}`
  }

  // The watcher's own ETags, apart from the pages' so a probe never answers a page from stale memory.
  const probeTags = new Map<string, string>()
  const PROBES: Record<string, string> = {
    notifications: '/notifications?all=false&per_page=50',
    pulls: '/pulls?state=all&sort=updated&direction=desc&per_page=20',
    issues: '/issues?state=all&sort=updated&direction=desc&per_page=20',
    runs: '/actions/runs?per_page=20',
  }

  return {
    kind: 'github' as const,
    async pullRefspec(number: number): Promise<string> {
      return `pull/${number}/head`
    },
    async probe(topic: string): Promise<{ changed: boolean | null; pollSeconds?: number }> {
      const suffix = PROBES[topic]
      const auth = await token()
      if (!suffix || !auth) return { changed: false }
      const path = `${await repoPath()}${suffix}`
      const before = probeTags.get(path)
      const response = await fetcher(await urlFor(path), {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${auth.token}`,
          'x-github-api-version': '2022-11-28',
          ...(before ? { 'if-none-match': before } : {}),
        },
      })
      const poll = Number(response.headers.get('x-poll-interval'))
      const pollSeconds = Number.isFinite(poll) && poll > 0 ? poll : undefined
      if (response.status === 304) return { changed: false, pollSeconds }
      if (!response.ok) return { changed: false, pollSeconds }
      await response.arrayBuffer()
      const etag = response.headers.get('etag')
      if (etag) probeTags.set(path, etag)
      return { changed: before === undefined ? null : etag !== before, pollSeconds }
    },

    // A pull request's checks finishing does not move its updatedAt, so the head's check state counts too.
    async itemsUpdatedAt(numbers: number[]): Promise<Map<number, string>> {
      if (!numbers.length || !(await token())) return new Map()
      const [owner, name] = await ownerAndName()
      const fields = numbers
        .map(
          (number) =>
            `i${number}: issueOrPullRequest(number: ${number}) { ... on Issue { updatedAt } ... on PullRequest { updatedAt commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } }`,
        )
        .join(' ')
      const data = await graphql<{ repository: Record<string, RawItemTime | null> }>(
        `query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { ${fields} } }`,
        { owner, repo: name },
      )
      const times = new Map<number, string>()
      for (const number of numbers) {
        const item = data.repository[`i${number}`]
        if (!item) continue
        const checks = item.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? ''
        times.set(number, `${item.updatedAt}|${checks}`)
      }
      return times
    },

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
        `sort:${input.sort.endsWith('-asc') ? input.sort : `${input.sort}-desc`}`,
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
      // Only organization repos have teams, and listing them needs more access than the rest.
      const teams = await call<{ slug: string; name: string }[]>(`${base}/teams?per_page=100`).catch(() => [])
      return {
        labels: labels.map((label) => ({ name: label.name, color: label.color, description: label.description ?? '' })),
        milestones: milestones.map((milestone) => ({ number: milestone.number, title: milestone.title })),
        people,
        teams: teams.map((team) => ({ slug: team.slug, name: team.name })),
      }
    },
    // Teams come as "org/slug" beside plain logins; GitHub takes them in a separate list by slug.
    async requestReviewers(number: number, input: { add: string[]; remove: string[] }): Promise<void> {
      const path = `${await repoPath()}/pulls/${number}/requested_reviewers`
      const split = (names: string[]) =>
        JSON.stringify({
          reviewers: names.filter((name) => !name.includes('/')),
          team_reviewers: names.filter((name) => name.includes('/')).map((name) => name.slice(name.indexOf('/') + 1)),
        })
      if (input.add.length) await call(path, { method: 'POST', body: split(input.add) })
      if (input.remove.length) await call(path, { method: 'DELETE', body: split(input.remove) })
    },
    async extras(number: number): Promise<ItemExtras> {
      const [owner, name] = await ownerAndName()
      const data = await graphql<RawExtras>(EXTRAS, { owner, repo: name, number })
      const item = data.repository.issueOrPullRequest
      if (!item) throw new HttpError(404, 'not-found', `no issue or pull request #${number}`)
      const pull = item.__typename === 'PullRequest'
      const refs = (pull ? item.closingIssuesReferences : item.closedByPullRequestsReferences)?.nodes ?? []
      // Projects need the read:project scope, so a token without it still gets the rest.
      const projects = await graphql<RawProjects>(PROJECTS, { owner, repo: name, number }).then(
        (found) =>
          (found.repository.issueOrPullRequest?.projectItems?.nodes ?? []).map((node) => ({
            title: node.project.title,
            status: node.fieldValueByName?.name ?? null,
            url: node.project.url,
          })),
        () => null,
      )
      return {
        subscription: item.viewerSubscription ?? 'UNSUBSCRIBED',
        pinned: pull ? null : Boolean(item.isPinned),
        projects,
        linked: refs.map(
          (ref): LinkedItem => ({
            number: ref.number,
            title: ref.title,
            pull: !pull,
            state: ref.state.toLowerCase() as LinkedItem['state'],
          }),
        ),
      }
    },
    // Commits review suggestions to the head branch as one commit, like GitHub's "Commit suggestions".
    async applySuggestions(number: number, ids: number[], message: string): Promise<void> {
      const base = await repoPath()
      const raw = await call<RawPullDetails>(`${base}/pulls/${number}`)
      const headRepo = raw.head.repo?.full_name
      if (!headRepo) throw new HttpError(409, 'stale', 'the head branch of this pull request is gone')
      const comments = await Promise.all(
        ids.map((id) =>
          call<{ path: string; line: number | null; start_line: number | null; side: string; body: string }>(
            `${base}/pulls/comments/${id}`,
          ),
        ),
      )
      const byPath = new Map<string, SuggestionEdit[]>()
      for (const comment of comments) {
        const lines = suggestionLines(comment.body)
        if (lines === null) throw new HttpError(400, 'bad-request', `a comment on ${comment.path} has no suggestion`)
        if (comment.line === null || comment.side !== 'RIGHT')
          throw new HttpError(409, 'stale', `the suggestion on ${comment.path} is outdated`)
        const edits = byPath.get(comment.path) ?? []
        edits.push({ start: comment.start_line ?? comment.line, end: comment.line, lines })
        byPath.set(comment.path, edits)
      }
      const additions = await Promise.all(
        [...byPath].map(async ([path, edits]) => {
          const file = await call<{ content: string }>(
            `/repos/${headRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${raw.head.sha}`,
          )
          const text = Buffer.from(file.content, 'base64').toString('utf8')
          return { path, contents: Buffer.from(applyEdits(text, edits), 'utf8').toString('base64') }
        }),
      )
      // The expected head makes GitHub refuse when someone pushed since the page was read.
      await graphql(
        'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }',
        {
          input: {
            branch: { repositoryNameWithOwner: headRepo, branchName: raw.head.ref },
            expectedHeadOid: raw.head.sha,
            message: { headline: message },
            fileChanges: { additions },
          },
        },
      )
    },
    async setSubscribed(number: number, subscribed: boolean): Promise<void> {
      await graphql(
        'mutation($id: ID!, $state: SubscriptionState!) { updateSubscription(input: { subscribableId: $id, state: $state }) { clientMutationId } }',
        { id: await nodeIdOf(number), state: subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED' },
      )
    },
    async setPinned(number: number, pinned: boolean): Promise<void> {
      const mutation = pinned
        ? 'mutation($id: ID!) { pinIssue(input: { issueId: $id }) { clientMutationId } }'
        : 'mutation($id: ID!) { unpinIssue(input: { issueId: $id }) { clientMutationId } }'
      await graphql(mutation, { id: await nodeIdOf(number) })
    },
    async transfer(number: number, target: string): Promise<{ number: number; url: string }> {
      const [owner, name] = target.split('/')
      const found = await graphql<{ repository: { id: string } | null }>(
        'query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { id } }',
        { owner, repo: name },
      ).catch(() => ({ repository: null }))
      if (!found.repository) throw new HttpError(404, 'not-found', `GitHub: no repository ${target} you can write to`)
      const moved = await graphql<{ transferIssue: { issue: { number: number; url: string } } }>(
        'mutation($id: ID!, $repo: ID!) { transferIssue(input: { issueId: $id, repositoryId: $repo }) { issue { number url } } }',
        { id: await nodeIdOf(number), repo: found.repository.id },
      )
      return moved.transferIssue.issue
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
    // GitHub opens the pull request first; reviewers, labels and assignees are set on it right after.
    async createPull(input: CreatePull): Promise<PullSummary> {
      const { reviewers, labels, assignees, ...open } = input
      const base = await repoPath()
      const created = pullSummary(await call<RawPull>(`${base}/pulls`, { method: 'POST', body: JSON.stringify(open) }))
      if (reviewers.length) await this.requestReviewers(created.number, { add: reviewers, remove: [] })
      if (labels.length || assignees.length) {
        await call(`${base}/issues/${created.number}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...(labels.length ? { labels } : {}), ...(assignees.length ? { assignees } : {}) }),
        })
      }
      return created
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
      // Checks come from the Checks API; some bots still report through commit statuses instead.
      const [{ check_runs }, { statuses }] = await Promise.all([
        call<{ check_runs: RawCheckRun[] }>(`${base}/commits/${head.sha}/check-runs?per_page=100`),
        call<{ statuses: RawStatus[] }>(`${base}/commits/${head.sha}/status`).catch(() => ({ statuses: [] })),
      ])
      const runs = check_runs.map((run): CheckRun => {
        // Actions links read .../actions/runs/<run>/job/<job>.
        const ids = /\/actions\/runs\/(\d+)\/job\/(\d+)/.exec(run.html_url ?? '')
        const took =
          run.started_at && run.completed_at ? (Date.parse(run.completed_at) - Date.parse(run.started_at)) / 1000 : null
        return {
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          url: run.html_url ?? '',
          runId: ids ? Number(ids[1]) : null,
          jobId: ids ? Number(ids[2]) : null,
          app: run.app?.name ?? null,
          avatar: run.app?.owner?.avatar_url ?? null,
          summary: run.output?.title ?? null,
          seconds: took !== null && took >= 0 ? took : null,
        }
      })
      const reported = statuses.map(
        (status): CheckRun => ({
          name: status.context,
          status: status.state === 'pending' ? 'pending' : 'completed',
          conclusion: status.state === 'success' ? 'success' : status.state === 'pending' ? null : 'failure',
          url: status.target_url ?? '',
          runId: null,
          jobId: null,
          app: null,
          avatar: status.avatar_url,
          summary: status.description,
          seconds: null,
        }),
      )
      return [...runs, ...reported]
    },
    async notifications(all: boolean): Promise<Notification[]> {
      const raw = await call<RawNotification[]>(`${await repoPath()}/notifications?all=${all}&per_page=50`)
      return raw.map((entry) => ({
        id: entry.id,
        title: entry.subject.title,
        type: entry.subject.type,
        reason: entry.reason,
        unread: entry.unread,
        updatedAt: entry.updated_at,
        number: Number(/\/(?:issues|pulls)\/(\d+)$/.exec(entry.subject.url ?? '')?.[1]) || null,
      }))
    },
    async markRead(id: string | null): Promise<void> {
      if (id) await call(`/notifications/threads/${encodeURIComponent(id)}`, { method: 'PATCH' })
      else await call(`${await repoPath()}/notifications`, { method: 'PUT', body: JSON.stringify({}) })
    },
    async releases(): Promise<Release[]> {
      const raw = await call<RawRelease[]>(`${await repoPath()}/releases?per_page=30`, FULL)
      return raw.map(release)
    },
    async createRelease(input: {
      tag: string
      target: string
      name: string
      body: string
      draft: boolean
      prerelease: boolean
      generateNotes: boolean
    }): Promise<Release> {
      return release(
        await call<RawRelease>(`${await repoPath()}/releases`, {
          method: 'POST',
          body: JSON.stringify({
            tag_name: input.tag,
            target_commitish: input.target || undefined,
            name: input.name || input.tag,
            body: input.body,
            draft: input.draft,
            prerelease: input.prerelease,
            generate_release_notes: input.generateNotes,
          }),
        }),
      )
    },
    async runs(): Promise<WorkflowRun[]> {
      const raw = await call<{ workflow_runs: RawRun[] }>(`${await repoPath()}/actions/runs?per_page=40`)
      return raw.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name ?? '',
        title: run.display_title ?? run.name ?? '',
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch ?? '',
        event: run.event,
        createdAt: run.created_at,
        actor: user(run.actor),
        url: run.html_url,
      }))
    },
    async runAction(runId: number, action: 'rerun' | 'rerun-failed' | 'cancel'): Promise<void> {
      const path = action === 'rerun-failed' ? 'rerun-failed-jobs' : action
      await call(`${await repoPath()}/actions/runs/${runId}/${path}`, { method: 'POST' })
    },
    async rerunFailed(runId: number): Promise<void> {
      await call(`${await repoPath()}/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' })
    },
    // The end of a job's log, where a failure says what went wrong.
    async jobLog(jobId: number): Promise<string> {
      const auth = await token()
      if (!auth) throw new HttpError(401, 'unauthorized', 'not signed in to GitHub')
      const response = await fetcher(await urlFor(`${await repoPath()}/actions/jobs/${jobId}/logs`), {
        headers: { authorization: `Bearer ${auth.token}`, 'x-github-api-version': '2022-11-28' },
      })
      if (!response.ok) throw new HttpError(502, 'failed', `GitHub: could not read the log (${response.status})`)
      return (await response.text()).split('\n').slice(-200).join('\n')
    },
    // REST only merges the base in; rebasing the head onto it needs GraphQL.
    async updateBranch(number: number, method: 'merge' | 'rebase' = 'merge'): Promise<void> {
      if (method === 'merge') {
        await call(`${await repoPath()}/pulls/${number}/update-branch`, { method: 'PUT', body: JSON.stringify({}) })
        return
      }
      await graphql(
        'mutation($id: ID!) { updatePullRequestBranch(input: { pullRequestId: $id, updateMethod: REBASE }) { clientMutationId } }',
        { id: await nodeIdOf(number) },
      )
    },
    async setAutoMerge(number: number, enabled: boolean, method: string): Promise<void> {
      const { nodeId } = await this.pull(number)
      const mutation = enabled
        ? 'mutation($id: ID!, $method: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method }) { clientMutationId } }'
        : 'mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { clientMutationId } }'
      await graphql(mutation, enabled ? { id: nodeId, method: method.toUpperCase() } : { id: nodeId })
    },
    async deleteHead(number: number): Promise<void> {
      const pull = await this.pull(number)
      if (!pull.sameRepo) throw new HttpError(409, 'bad-request', 'the branch lives in a fork')
      await call(`${await repoPath()}/git/refs/heads/${pull.headRef}`, { method: 'DELETE' })
    },
    async restoreHead(number: number): Promise<void> {
      const pull = await this.pull(number)
      await call(`${await repoPath()}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${pull.headRef}`, sha: pull.headSha }),
      })
    },
    async setBase(number: number, base: string): Promise<void> {
      await call(`${await repoPath()}/pulls/${number}`, { method: 'PATCH', body: JSON.stringify({ base }) })
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
      const [owner] = await ownerAndName()
      for (const team of raw.requested_teams ?? []) {
        latest.set(`${owner}/${team.slug}`, { login: `${owner}/${team.slug}`, avatarUrl: '', state: null })
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
        autoMerge: Boolean(raw.auto_merge),
        sameRepo: raw.head.repo?.full_name === raw.base.repo?.full_name,
        // GitHub drops head.repo when the branch's repo is gone; a deleted branch shows as a missing ref.
        headExists: await call(`${base}/git/ref/heads/${encodeURIComponent(raw.head.ref)}`).then(
          () => true,
          () => false,
        ),
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
      input: { body: string; path: string; line: number; startLine?: number; side: 'LEFT' | 'RIGHT'; commitId: string },
    ): Promise<GitHubReviewComment> {
      return reviewComment(
        await call<RawReviewComment>(`${await repoPath()}/pulls/${number}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            body: input.body,
            path: input.path,
            line: input.line,
            side: input.side,
            ...rangeStart(input),
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
    async submitReview(number: number, event: string, body: string, comments: PendingComment[] = []): Promise<void> {
      await call(`${await repoPath()}/pulls/${number}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          event,
          body: body || undefined,
          comments: comments.length
            ? comments.map(({ startLine, ...comment }) => ({ ...comment, ...rangeStart({ ...comment, startLine }) }))
            : undefined,
        }),
      })
    },
    async reviewState(number: number): Promise<ReviewState> {
      const name = await repoSlug()
      if (!name) throw new HttpError(409, 'bad-request', 'this repository has no GitHub remote named origin')
      const [owner, repo] = name.split('/')
      const data = await graphql<RawReviewState>(REVIEW_STATE, { owner, repo, number })
      const pull = data.repository.pullRequest
      return {
        threads: pull.reviewThreads.nodes.flatMap((thread) => {
          const root = thread.comments.nodes[0]?.databaseId
          return root ? [{ id: thread.id, resolved: thread.isResolved, outdated: thread.isOutdated, root }] : []
        }),
        viewed: pull.files.nodes.filter((file) => file.viewerViewedState === 'VIEWED').map((file) => file.path),
      }
    },
    async resolveThread(thread: string, resolved: boolean): Promise<void> {
      const mutation = resolved
        ? 'mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { clientMutationId } }'
        : 'mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { clientMutationId } }'
      await graphql(mutation, { id: thread })
    },
    async setViewed(number: number, path: string, viewed: boolean): Promise<void> {
      const { nodeId } = await this.pull(number)
      const mutation = viewed
        ? 'mutation($id: ID!, $path: String!) { markFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId } }'
        : 'mutation($id: ID!, $path: String!) { unmarkFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId } }'
      await graphql(mutation, { id: nodeId, path })
    },
    async merge(
      number: number,
      input: { method: string; title?: string; message?: string; sha?: string },
    ): Promise<void> {
      await call(`${await repoPath()}/pulls/${number}/merge`, {
        method: 'PUT',
        body: JSON.stringify({
          merge_method: input.method,
          ...(input.title ? { commit_title: input.title } : {}),
          ...(input.message !== undefined ? { commit_message: input.message } : {}),
          ...(input.sha ? { sha: input.sha } : {}),
        }),
      })
    },
    async mergeInfo(number: number): Promise<MergeInfo> {
      const [owner, name] = await ownerAndName()
      const data = await graphql<RawMergeInfo>(MERGE_INFO, { owner, repo: name, number })
      const repo = data.repository
      const pull = repo.pullRequest
      if (!pull) throw new HttpError(404, 'not-found', `no pull request #${number}`)
      const methods = [
        ...(repo.squashMergeAllowed ? (['squash'] as const) : []),
        ...(repo.mergeCommitAllowed ? (['merge'] as const) : []),
        ...(repo.rebaseMergeAllowed ? (['rebase'] as const) : []),
      ]
      const lower = (value: string) => value.toLowerCase() as MergeInfo['defaultMethod']
      const preferred = lower(repo.viewerDefaultMergeMethod)
      return {
        methods,
        defaultMethod: methods.includes(preferred) ? preferred : (methods[0] ?? 'merge'),
        autoMergeAllowed: repo.autoMergeAllowed,
        deleteBranchOnMerge: repo.deleteBranchOnMerge,
        reviewDecision: pull.reviewDecision,
        requiredApprovals: pull.baseRef?.branchProtectionRule?.requiredApprovingReviewCount ?? null,
        mergeState: pull.mergeStateStatus,
        canMergeAsAdmin: pull.viewerCanMergeAsAdmin,
        autoMerge: pull.autoMergeRequest
          ? {
              by: pull.autoMergeRequest.enabledBy?.login ?? 'someone',
              method: lower(pull.autoMergeRequest.mergeMethod),
            }
          : null,
        squashTitle: repo.squashMergeCommitTitle,
        squashMessage: repo.squashMergeCommitMessage,
        mergeTitle: repo.mergeCommitTitle,
        mergeMessage: repo.mergeCommitMessage,
      }
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
    async createIssue(input: {
      title: string
      body: string
      labels: string[]
      assignees: string[]
    }): Promise<IssueSummary> {
      return issueSummary(
        await call<RawIssue>(`${await repoPath()}/issues`, { method: 'POST', body: JSON.stringify(input) }),
      )
    },
    // GitHub records why an issue closed: done, or not going to be done.
    async setIssueState(number: number, state: 'open' | 'closed', reason?: 'completed' | 'not_planned'): Promise<void> {
      await call(`${await repoPath()}/issues/${number}`, {
        method: 'PATCH',
        body: JSON.stringify(state === 'closed' && reason ? { state, state_reason: reason } : { state }),
      })
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
  auto_merge?: unknown
  head: { ref: string; sha: string; repo: { full_name: string } | null }
  base: { ref: string; sha: string; repo: { full_name: string } | null }
  node_id: string
  locked?: boolean
  commits: number
  requested_reviewers?: RawUser[]
  requested_teams?: { slug: string }[]
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
  started_at?: string | null
  completed_at?: string | null
  output?: { title?: string | null } | null
  app?: { name?: string; owner?: { avatar_url?: string } | null } | null
}
interface RawStatus {
  context: string
  state: 'success' | 'pending' | 'failure' | 'error'
  description: string | null
  target_url: string | null
  avatar_url: string | null
}
interface RawReviewComment extends RawComment {
  path: string
  line: number | null
  start_line?: number | null
  pull_request_review_id?: number | null
  side?: 'LEFT' | 'RIGHT'
  in_reply_to_id?: number
}

// GitHub takes a range as start_line and start_side beside line; one line sends neither.
const rangeStart = (input: { line: number; startLine?: number; side: string }) =>
  input.startLine && input.startLine < input.line ? { start_line: input.startLine, start_side: input.side } : {}
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
    startLine: raw.start_line ?? null,
    reviewId: raw.pull_request_review_id ?? null,
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
        number title state url updatedAt createdAt closedAt
        author { login avatarUrl }
        labels(first: 10) { nodes { name color } }
        comments { totalCount }
        assignees(first: 5) { nodes { login avatarUrl } }
        milestone { title }
      }
      ... on PullRequest {
        number title state url updatedAt createdAt closedAt mergedAt isDraft merged reviewDecision
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
  createdAt?: string
  closedAt?: string | null
  mergedAt?: string | null
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
    createdAt: node.createdAt ?? node.updatedAt,
    closedAt: node.mergedAt ?? node.closedAt ?? null,
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

// Thread ids and resolved state, plus the viewer's viewed files, live only in GraphQL.
const REVIEW_STATE = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) { nodes { id isResolved isOutdated comments(first: 1) { nodes { databaseId } } } }
      files(first: 100) { nodes { path viewerViewedState } }
    }
  }
}`

interface RawReviewState {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: { id: string; isResolved: boolean; isOutdated: boolean; comments: { nodes: { databaseId: number }[] } }[]
      }
      files: { nodes: { path: string; viewerViewedState: string }[] }
    }
  }
}

interface RawNotification {
  id: string
  reason: string
  unread: boolean
  updated_at: string
  subject: { title: string; type: string; url: string | null }
}
interface RawRelease {
  id: number
  name: string | null
  tag_name: string
  body: string | null
  body_html?: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
  author: RawUser | null
  html_url: string
}
interface RawRun {
  id: number
  name: string | null
  display_title?: string
  status: string
  conclusion: string | null
  head_branch: string | null
  event: string
  created_at: string
  actor: RawUser | null
  html_url: string
}

function release(raw: RawRelease): Release {
  return {
    id: raw.id,
    name: raw.name || raw.tag_name,
    tag: raw.tag_name,
    body: raw.body ?? '',
    html: raw.body_html ?? null,
    draft: raw.draft,
    prerelease: raw.prerelease,
    publishedAt: raw.published_at,
    author: user(raw.author),
    url: raw.html_url,
  }
}

const EXTRAS = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue {
        viewerSubscription
        isPinned
        closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { number title state } }
      }
      ... on PullRequest {
        viewerSubscription
        closingIssuesReferences(first: 10) { nodes { number title state } }
      }
    }
  }
}`

interface RawRefs {
  nodes: { number: number; title: string; state: string }[]
}

interface RawExtras {
  repository: {
    issueOrPullRequest: {
      __typename: 'Issue' | 'PullRequest'
      viewerSubscription?: ItemExtras['subscription'] | null
      isPinned?: boolean
      closedByPullRequestsReferences?: RawRefs
      closingIssuesReferences?: RawRefs
    } | null
  }
}

const PROJECT_ITEMS = `projectItems(first: 10) {
  nodes {
    project { title url }
    fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
  }
}`

const PROJECTS = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issueOrPullRequest(number: $number) {
      ... on Issue { ${PROJECT_ITEMS} }
      ... on PullRequest { ${PROJECT_ITEMS} }
    }
  }
}`

interface RawProjects {
  repository: {
    issueOrPullRequest: {
      projectItems?: {
        nodes: { project: { title: string; url: string }; fieldValueByName: { name?: string } | null }[]
      }
    } | null
  }
}

const MERGE_INFO = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed autoMergeAllowed deleteBranchOnMerge
    viewerDefaultMergeMethod squashMergeCommitTitle squashMergeCommitMessage mergeCommitTitle mergeCommitMessage
    pullRequest(number: $number) {
      reviewDecision mergeStateStatus viewerCanMergeAsAdmin
      autoMergeRequest { enabledBy { login } mergeMethod }
      baseRef { branchProtectionRule { requiredApprovingReviewCount } }
    }
  }
}`

interface RawMergeInfo {
  repository: {
    mergeCommitAllowed: boolean
    squashMergeAllowed: boolean
    rebaseMergeAllowed: boolean
    autoMergeAllowed: boolean
    deleteBranchOnMerge: boolean
    viewerDefaultMergeMethod: string
    squashMergeCommitTitle: MergeInfo['squashTitle']
    squashMergeCommitMessage: MergeInfo['squashMessage']
    mergeCommitTitle: MergeInfo['mergeTitle']
    mergeCommitMessage: MergeInfo['mergeMessage']
    pullRequest: {
      reviewDecision: MergeInfo['reviewDecision']
      mergeStateStatus: string
      viewerCanMergeAsAdmin: boolean
      autoMergeRequest: { enabledBy: { login: string } | null; mergeMethod: string } | null
      baseRef: { branchProtectionRule: { requiredApprovingReviewCount: number | null } | null } | null
    } | null
  }
}
