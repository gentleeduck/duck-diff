import type {
  CheckRun,
  ConversationComment,
  GitHubReviewComment,
  GitHubStatus,
  GitHubUser,
  IssueDetails,
  IssueSummary,
  ListItem,
  ListPage,
  ListQuery,
  MergeInfo,
  Notification,
  Options,
  PullCommit,
  PullDetails,
  PullSummary,
  Release,
  Thread,
  TimelineEvent,
  WorkflowRun,
} from '@duck-diff/protocol'
import { HttpError } from './errors'
import { apiBases, type RemoteHost } from './forge-host'

export interface GitLabOptions {
  fetch?: typeof fetch
  findToken?: (host: string) => Promise<{ token: string; source: 'env' | 'gh' } | null>
}

type Kind = 'pr' | 'issue'

interface RawUser {
  username: string
  avatar_url: string | null
}
interface RawLabel {
  name: string
  color: string
}
interface RawItem {
  id: number
  iid: number
  title: string
  description: string | null
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft?: boolean
  author: RawUser
  assignees?: RawUser[]
  labels: (RawLabel | string)[]
  milestone: { title: string } | null
  user_notes_count: number
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at?: string | null
  web_url: string
  discussion_locked?: boolean | null
  source_branch?: string
  target_branch?: string
  source_project_id?: number
  target_project_id?: number
  sha?: string
  diff_refs?: { base_sha: string; head_sha: string } | null
  merge_status?: string
  detailed_merge_status?: string
  merge_when_pipeline_succeeds?: boolean
  changes_count?: string | null
  reviewers?: RawUser[]
}
interface RawNote {
  id: number
  body: string
  author: RawUser
  created_at: string
  updated_at: string
  system: boolean
  position?: { new_path: string; old_path: string; new_line: number | null; old_line: number | null } | null
}

// Bun.spawn, not node:child_process: in Bun that can lose a quick child's exit and output (oven-sh/bun#45483).
async function runGlab(args: string[]): Promise<string | null> {
  try {
    const child = Bun.spawn(['glab', ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' })
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
    return code === 0 && out.trim() ? out.trim() : null
  } catch {
    return null
  }
}

async function defaultFindToken(host: string) {
  const env = process.env.GITLAB_TOKEN ?? process.env.GL_TOKEN
  if (env) return { token: env, source: 'env' as const }
  const token = await runGlab(['config', 'get', 'token', '--host', host])
  return token ? { token, source: 'gh' as const } : null
}

const user = (raw: RawUser | null | undefined): GitHubUser => ({
  login: raw?.username ?? 'ghost',
  avatarUrl: raw?.avatar_url ?? '',
})
const labels = (raw: (RawLabel | string)[]) =>
  raw.map((label) =>
    typeof label === 'string'
      ? { name: label, color: '808080' }
      : { name: label.name, color: label.color.replace('#', '') },
  )
const open = (state: RawItem['state']) => (state === 'opened' || state === 'locked' ? 'open' : 'closed')
const note = (raw: RawNote): ConversationComment => ({
  id: raw.id,
  author: user(raw.author),
  body: raw.body,
  createdAt: raw.created_at,
})

function listItem(raw: RawItem): ListItem {
  return {
    number: raw.iid,
    title: raw.title,
    state: open(raw.state),
    merged: raw.state === 'merged',
    draft: Boolean(raw.draft),
    author: user(raw.author),
    labels: labels(raw.labels),
    comments: raw.user_notes_count,
    assignees: (raw.assignees ?? []).map(user),
    milestone: raw.milestone?.title ?? null,
    updatedAt: raw.updated_at,
    createdAt: raw.created_at,
    closedAt: raw.merged_at ?? raw.closed_at,
    url: raw.web_url,
    review: null,
    checks: null,
  }
}

const pullSummary = (raw: RawItem): PullSummary => ({
  number: raw.iid,
  title: raw.title,
  state: open(raw.state),
  merged: raw.state === 'merged',
  draft: Boolean(raw.draft),
  author: user(raw.author),
  headRef: raw.source_branch ?? '',
  baseRef: raw.target_branch ?? '',
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  labels: labels(raw.labels),
  url: raw.web_url,
})

const issueSummary = (raw: RawItem): IssueSummary => ({
  number: raw.iid,
  title: raw.title,
  state: open(raw.state),
  author: user(raw.author),
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  labels: labels(raw.labels),
  comments: raw.user_notes_count,
  url: raw.web_url,
})

const SORT: Record<ListQuery['sort'], string> = {
  updated: 'order_by=updated_at&sort=desc',
  'updated-asc': 'order_by=updated_at&sort=asc',
  created: 'order_by=created_at&sort=desc',
  'created-asc': 'order_by=created_at&sort=asc',
  // GitLab cannot sort by comments; most recently updated is the nearest.
  comments: 'order_by=updated_at&sort=desc',
  'comments-asc': 'order_by=updated_at&sort=asc',
}

const PROBES: Record<string, string> = {
  pulls: 'PROJECT/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=1',
  issues: 'PROJECT/issues?state=all&order_by=updated_at&sort=desc&per_page=1',
  runs: 'PROJECT/pipelines?order_by=updated_at&sort=desc&per_page=1',
  notifications: '/todos?per_page=1',
}

const PIPELINE_STATUS: Record<string, CheckRun['status']> = {
  created: 'queued',
  waiting_for_resource: 'waiting',
  preparing: 'queued',
  pending: 'pending',
  running: 'in_progress',
  scheduled: 'queued',
  manual: 'waiting',
}
const PIPELINE_CONCLUSION: Record<string, CheckRun['conclusion']> = {
  success: 'success',
  failed: 'failure',
  canceled: 'cancelled',
  skipped: 'skipped',
}

// GitLab merge requests, issues, pipelines and releases, mapped to the same shapes the GitHub pages read.
// What GitLab has no counterpart for answers 501 through the forge, so the page says so.
export function createGitLab(remote: RemoteHost, options: GitLabOptions = {}) {
  const fetcher = options.fetch ?? fetch
  const findToken = options.findToken ?? defaultFindToken
  const { rest } = apiBases(remote)
  const project = `/projects/${encodeURIComponent(remote.slug)}`
  let pasted: string | null = null
  let found: Promise<{ token: string; source: GitHubStatus['source'] } | null> | null = null
  let me: Promise<RawUser | null> | null = null
  const marks = new Map<string, string>()

  async function token() {
    if (pasted) return { token: pasted, source: 'token' as const }
    found ??= findToken(remote.host).then((result) => {
      if (!result) found = null
      return result
    })
    return found
  }

  async function send<T>(path: string, init: RequestInit = {}): Promise<{ body: T; headers: Headers }> {
    const auth = await token()
    if (!auth) throw new HttpError(401, 'unauthorized', 'not signed in to GitLab')
    const response = await fetcher(`${rest}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${auth.token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    })
    if (response.status === 401) found = null
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown; error?: string } | null
      const message = typeof body?.message === 'string' ? body.message : (body?.error ?? response.statusText)
      throw new HttpError(response.status === 404 ? 404 : 502, 'failed', `GitLab: ${message}`)
    }
    const text = await response.text()
    return { body: (text ? JSON.parse(text) : {}) as T, headers: response.headers }
  }
  const call = async <T>(path: string, init?: RequestInit) => (await send<T>(path, init)).body
  const viewer = () => {
    me ??= call<RawUser>('/user').catch(() => null)
    return me
  }
  const notes = async (kind: Kind, number: number) =>
    call<RawNote[]>(`${project}/${kind === 'pr' ? 'merge_requests' : 'issues'}/${number}/notes?sort=asc&per_page=100`)

  return {
    kind: 'gitlab' as const,
    pullRefspec: (number: number) => `merge-requests/${number}/head`,

    async status(): Promise<GitHubStatus> {
      const auth = await token()
      if (!auth) return { repo: remote.slug, user: null, source: null }
      const raw = await viewer()
      return { repo: remote.slug, user: raw ? user(raw) : null, source: raw ? auth.source : null }
    },
    setToken(next: string) {
      pasted = next
      found = null
      me = null
    },

    async list(input: ListQuery): Promise<ListPage> {
      const area = input.kind === 'pr' ? 'merge_requests' : 'issues'
      const page = Number(input.after ?? '1') || 1
      const viewerName = (await viewer())?.username ?? ''
      const scope: Record<ListQuery['filter'], string> = {
        all: 'scope=all',
        mine: 'scope=created_by_me',
        assigned: 'scope=assigned_to_me',
        'review-requested': `scope=all&reviewer_username=${encodeURIComponent(viewerName)}`,
        mentioned: 'scope=all',
      }
      const search = input.query.trim() ? `&search=${encodeURIComponent(input.query.trim())}` : ''
      const base = `${project}/${area}?${scope[input.filter]}&${SORT[input.sort]}&with_labels_details=true&per_page=30&page=${page}${search}`
      // GitHub's closed pull requests include merged ones; GitLab keeps them apart.
      const states = input.state === 'open' ? ['opened'] : input.kind === 'pr' ? ['closed', 'merged'] : ['closed']
      const answers = await Promise.all(states.map((state) => send<RawItem[]>(`${base}&state=${state}`)))
      const items = answers
        .flatMap((answer) => answer.body)
        .sort((a, b) => (input.sort.endsWith('-asc') ? 1 : -1) * a.updated_at.localeCompare(b.updated_at))
        .map(listItem)
      const total = answers.reduce((sum, answer) => sum + (Number(answer.headers.get('x-total')) || 0), 0)
      const more = answers.some((answer) => answer.headers.get('x-next-page'))
      return { items, total: total || items.length, cursor: more ? String(page + 1) : null }
    },
    async pulls(state: 'open' | 'closed'): Promise<PullSummary[]> {
      const raw = await call<RawItem[]>(
        `${project}/merge_requests?state=${state === 'open' ? 'opened' : 'closed'}&order_by=updated_at&per_page=50`,
      )
      return raw.map(pullSummary)
    },
    async issues(state: 'open' | 'closed'): Promise<IssueSummary[]> {
      const raw = await call<RawItem[]>(
        `${project}/issues?state=${state === 'open' ? 'opened' : 'closed'}&order_by=updated_at&per_page=50`,
      )
      return raw.map(issueSummary)
    },

    async issue(number: number): Promise<IssueDetails> {
      const [raw, conversation] = await Promise.all([
        call<RawItem>(`${project}/issues/${number}?with_labels_details=true`),
        notes('issue', number),
      ])
      return {
        ...issueSummary(raw),
        locked: Boolean(raw.discussion_locked),
        assignees: (raw.assignees ?? []).map(user),
        milestone: raw.milestone?.title ?? null,
        body: raw.description ?? '',
        conversation: conversation.filter((entry) => !entry.system).map(note),
      }
    },

    async pull(number: number): Promise<PullDetails> {
      const base = `${project}/merge_requests/${number}`
      const [raw, all, commits, approvals] = await Promise.all([
        call<RawItem>(`${base}?with_labels_details=true`),
        notes('pr', number),
        call<unknown[]>(`${base}/commits?per_page=100`),
        call<{ approved_by?: { user: RawUser }[] }>(`${base}/approvals`).catch(() => ({ approved_by: [] })),
      ])
      const approved = new Set((approvals.approved_by ?? []).map((entry) => entry.user.username))
      const reviewers = (raw.reviewers ?? []).map((entry) => ({
        ...user(entry),
        state: approved.has(entry.username) ? ('APPROVED' as const) : null,
      }))
      for (const login of approved)
        if (!reviewers.some((entry) => entry.login === login))
          reviewers.push({ login, avatarUrl: '', state: 'APPROVED' })
      const comments = all.filter((entry) => !entry.system && !entry.position)
      const reviewComments: GitHubReviewComment[] = all
        .filter((entry) => !entry.system && entry.position)
        .map((entry) => ({
          ...note(entry),
          path: entry.position?.new_path ?? '',
          line: entry.position?.new_line ?? entry.position?.old_line ?? null,
          startLine: null,
          side: entry.position?.new_line ? 'RIGHT' : 'LEFT',
          inReplyTo: null,
          reviewId: null,
        }))
      return {
        ...pullSummary(raw),
        commits: commits.length,
        assignees: (raw.assignees ?? []).map(user),
        milestone: raw.milestone?.title ?? null,
        reviewers,
        mergeableState: raw.detailed_merge_status ?? 'unknown',
        nodeId: String(raw.id),
        locked: Boolean(raw.discussion_locked),
        autoMerge: Boolean(raw.merge_when_pipeline_succeeds),
        sameRepo: raw.source_project_id === raw.target_project_id,
        headExists: true,
        body: raw.description ?? '',
        headSha: raw.sha ?? raw.diff_refs?.head_sha ?? '',
        baseSha: raw.diff_refs?.base_sha ?? '',
        mergeable: raw.merge_status === 'can_be_merged' ? true : raw.merge_status === 'cannot_be_merged' ? false : null,
        additions: 0,
        deletions: 0,
        changedFiles: Number.parseInt(raw.changes_count ?? '0', 10) || 0,
        comments: comments.map(note),
        reviewComments,
      }
    },

    async pullCommits(number: number): Promise<PullCommit[]> {
      const raw = await call<{ id: string; message: string; author_name: string; authored_date: string }[]>(
        `${project}/merge_requests/${number}/commits?per_page=100`,
      )
      return raw
        .reverse()
        .map((entry) => ({
          sha: entry.id,
          message: entry.message,
          author: { login: entry.author_name, avatarUrl: '' },
          authorName: entry.author_name,
          date: entry.authored_date,
        }))
    },

    // The conversation as GitHub's timeline: comments, and GitLab's system notes as events.
    async thread(number: number, kind: Kind = 'issue'): Promise<Thread> {
      const area = kind === 'pr' ? 'merge_requests' : 'issues'
      const [raw, all, viewerRaw] = await Promise.all([
        call<RawItem>(`${project}/${area}/${number}`),
        notes(kind, number),
        viewer(),
      ])
      const timeline: TimelineEvent[] = all
        .filter((entry) => !entry.position)
        .map((entry) =>
          entry.system
            ? {
                kind: 'event',
                id: String(entry.id),
                event: 'note',
                actor: user(entry.author),
                text: entry.body,
                createdAt: entry.created_at,
              }
            : {
                kind: 'comment',
                id: entry.id,
                author: user(entry.author),
                body: entry.body,
                html: null,
                createdAt: entry.created_at,
                edited: entry.updated_at !== entry.created_at,
                reactions: {},
                url: `${raw.web_url}#note_${entry.id}`,
              },
        )
      return {
        number: raw.iid,
        title: raw.title,
        body: raw.description ?? '',
        html: null,
        author: user(raw.author),
        createdAt: raw.created_at,
        edited: raw.updated_at !== raw.created_at,
        reactions: {},
        timeline,
        viewer: { login: viewerRaw?.username ?? '', canEdit: true },
      }
    },

    async commentOn(number: number, body: string, kind: Kind = 'issue'): Promise<ConversationComment> {
      const area = kind === 'pr' ? 'merge_requests' : 'issues'
      return note(
        await call<RawNote>(`${project}/${area}/${number}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
      )
    },
    async createIssue(input: {
      title: string
      body: string
      labels: string[]
      assignees: string[]
    }): Promise<IssueSummary> {
      return issueSummary(
        await call<RawItem>(`${project}/issues`, {
          method: 'POST',
          body: JSON.stringify({ title: input.title, description: input.body, labels: input.labels.join(',') }),
        }),
      )
    },
    async setIssueState(number: number, state: 'open' | 'closed'): Promise<void> {
      await call(`${project}/issues/${number}`, {
        method: 'PUT',
        body: JSON.stringify({ state_event: state === 'open' ? 'reopen' : 'close' }),
      })
    },
    async setPullState(number: number, state: 'open' | 'closed'): Promise<void> {
      await call(`${project}/merge_requests/${number}`, {
        method: 'PUT',
        body: JSON.stringify({ state_event: state === 'open' ? 'reopen' : 'close' }),
      })
    },
    async merge(
      number: number,
      input: { method: string; title?: string; message?: string; sha?: string },
    ): Promise<void> {
      await call(`${project}/merge_requests/${number}/merge`, {
        method: 'PUT',
        body: JSON.stringify({
          squash: input.method === 'squash',
          ...(input.message !== undefined ? { merge_commit_message: input.message } : {}),
          ...(input.sha ? { sha: input.sha } : {}),
        }),
      })
    },
    async mergeInfo(number: number): Promise<MergeInfo> {
      const raw = await call<RawItem>(`${project}/merge_requests/${number}`)
      return {
        methods: ['merge', 'squash'],
        defaultMethod: 'merge',
        autoMergeAllowed: true,
        deleteBranchOnMerge: false,
        reviewDecision: null,
        requiredApprovals: null,
        mergeState:
          raw.detailed_merge_status === 'mergeable' ? 'CLEAN' : (raw.detailed_merge_status ?? 'UNKNOWN').toUpperCase(),
        canMergeAsAdmin: false,
        autoMerge: raw.merge_when_pipeline_succeeds ? { by: 'someone', method: 'merge' } : null,
        squashTitle: 'PR_TITLE',
        squashMessage: 'COMMIT_MESSAGES',
        mergeTitle: 'MERGE_MESSAGE',
        mergeMessage: 'PR_TITLE',
      }
    },

    async checks(number: number): Promise<CheckRun[]> {
      const pipelines = await call<{ id: number }[]>(`${project}/merge_requests/${number}/pipelines?per_page=1`)
      const latest = pipelines[0]
      if (!latest) return []
      const jobs = await call<
        { id: number; name: string; status: string; web_url: string; duration: number | null; stage: string }[]
      >(`${project}/pipelines/${latest.id}/jobs?per_page=100`)
      return jobs.map((job) => ({
        name: `${job.stage} / ${job.name}`,
        status: PIPELINE_CONCLUSION[job.status] ? 'completed' : (PIPELINE_STATUS[job.status] ?? 'queued'),
        conclusion: PIPELINE_CONCLUSION[job.status] ?? null,
        url: job.web_url,
        runId: null,
        jobId: null,
        app: 'GitLab CI',
        avatar: null,
        summary: null,
        seconds: job.duration === null ? null : Math.round(job.duration),
      }))
    },
    async runs(): Promise<WorkflowRun[]> {
      const raw = await call<
        {
          id: number
          status: string
          ref: string
          source: string
          created_at: string
          web_url: string
          user?: RawUser
          name?: string | null
        }[]
      >(`${project}/pipelines?per_page=40`)
      return raw.map((run) => ({
        id: run.id,
        name: run.name ?? 'pipeline',
        title: `#${run.id}`,
        status: PIPELINE_CONCLUSION[run.status] ? 'completed' : run.status,
        conclusion: PIPELINE_CONCLUSION[run.status] ?? null,
        branch: run.ref,
        event: run.source,
        createdAt: run.created_at,
        actor: user(run.user),
        url: run.web_url,
      }))
    },
    async releases(): Promise<Release[]> {
      const raw = await call<
        {
          tag_name: string
          name: string | null
          description: string | null
          released_at: string | null
          upcoming_release?: boolean
          author?: RawUser
          _links?: { self?: string }
        }[]
      >(`${project}/releases?per_page=30`)
      return raw.map((release, index) => ({
        id: index + 1,
        name: release.name ?? release.tag_name,
        tag: release.tag_name,
        body: release.description ?? '',
        html: null,
        draft: false,
        prerelease: Boolean(release.upcoming_release),
        publishedAt: release.released_at,
        author: user(release.author),
        url: release._links?.self ?? '',
      }))
    },
    // GitLab's to-do list is its nearest thing to GitHub's notifications.
    async notifications(all: boolean): Promise<Notification[]> {
      const raw = await call<
        {
          id: number
          action_name: string
          target_type: string
          state: string
          updated_at: string
          target?: { iid?: number; title?: string }
          body?: string
        }[]
      >(`/todos?per_page=50${all ? '&state=all' : ''}`)
      return raw.map((todo) => ({
        id: String(todo.id),
        title: todo.target?.title ?? todo.body ?? todo.action_name,
        type: todo.target_type === 'MergeRequest' ? 'PullRequest' : todo.target_type,
        reason: todo.action_name === 'review_requested' ? 'review_requested' : todo.action_name,
        unread: todo.state === 'pending',
        updatedAt: todo.updated_at,
        number: todo.target?.iid ?? null,
      }))
    },
    async markRead(id: string | null): Promise<void> {
      await call(id ? `/todos/${encodeURIComponent(id)}/mark_as_done` : '/todos/mark_as_done', { method: 'POST' })
    },
    async defaultBranch(): Promise<string> {
      return (await call<{ default_branch: string }>(project)).default_branch
    },
    async avatars(): Promise<Record<string, string>> {
      return {}
    },
    async mentions(): Promise<GitHubUser[]> {
      return (await call<RawUser[]>(`${project}/members/all?per_page=100`)).map(user)
    },
    async options(): Promise<Options> {
      const [labelList, milestones, people] = await Promise.all([
        call<{ name: string; color: string; description: string | null }[]>(`${project}/labels?per_page=100`),
        call<{ iid: number; title: string }[]>(`${project}/milestones?state=active&per_page=100`),
        call<RawUser[]>(`${project}/members/all?per_page=100`),
      ])
      return {
        labels: labelList.map((label) => ({
          name: label.name,
          color: label.color.replace('#', ''),
          description: label.description ?? '',
        })),
        milestones: milestones.map((milestone) => ({ number: milestone.iid, title: milestone.title })),
        people: people.map(user),
        teams: [],
      }
    },
    // The watcher's probes. Without ETags, the newest entry's time and the total stand for the list.
    async probe(topic: string): Promise<{ changed: boolean | null }> {
      const path = PROBES[topic]
      if (!path || !(await token())) return { changed: false }
      const answer = await send<{ id: number; updated_at?: string; status?: string }[]>(
        path.replace('PROJECT', project),
      )
      const first = answer.body[0]
      const mark = `${first?.id ?? ''}|${first?.updated_at ?? ''}|${first?.status ?? ''}|${answer.headers.get('x-total') ?? ''}`
      const before = marks.get(topic)
      marks.set(topic, mark)
      return { changed: before === undefined ? null : before !== mark }
    },
    // Merge requests and issues are numbered apart on GitLab, so a number's time covers both.
    async itemsUpdatedAt(numbers: number[]): Promise<Map<number, string>> {
      if (!numbers.length || !(await token())) return new Map()
      const iids = numbers.map((number) => `iids[]=${number}`).join('&')
      const [pulls, issues] = await Promise.all([
        call<RawItem[]>(`${project}/merge_requests?${iids}&per_page=100`),
        call<RawItem[]>(`${project}/issues?${iids}&per_page=100`),
      ])
      const times = new Map<number, string>()
      for (const item of [...pulls, ...issues]) times.set(item.iid, `${times.get(item.iid) ?? ''}|${item.updated_at}`)
      return times
    },
  }
}

export type GitLab = ReturnType<typeof createGitLab>
