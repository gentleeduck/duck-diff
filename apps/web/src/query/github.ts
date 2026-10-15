import type { ListQuery } from '@duck-diff/protocol'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { readIndex } from '../github/item-index'
import type { Api, ItemState } from '../lib/api'

// Reads no live event covers; they are read again when a page shows them after this long.
const UNWATCHED_MS = 60_000
const SLOW_MS = 5 * 60_000
const item = (number: number) => `item:${number}`

// Every GitHub read, keyed under 'github' and tagged with the live topics that make it stale.
export function githubQueries(api: Api) {
  const gh = api.github
  return {
    status: () =>
      queryOptions({
        queryKey: ['github', 'status'],
        queryFn: () => gh.status(),
        staleTime: SLOW_MS,
        meta: { persist: true },
      }),
    // Pages follow GitHub's cursor; a live event reads the loaded pages again in place.
    list: (query: Omit<ListQuery, 'after'>) =>
      infiniteQueryOptions({
        queryKey: ['github', 'list', query],
        queryFn: ({ pageParam }) => gh.list({ ...query, after: pageParam ?? undefined }),
        initialPageParam: null as string | null,
        getNextPageParam: (page) => page.cursor,
        meta: { topics: [query.kind === 'pr' ? 'pulls' : 'issues'], persist: true },
      }),
    pulls: (state: ItemState) =>
      queryOptions({
        queryKey: ['github', 'pulls', state],
        queryFn: () => gh.pulls(state),
        meta: { topics: ['pulls'] },
      }),
    issues: (state: ItemState) =>
      queryOptions({
        queryKey: ['github', 'issues', state],
        queryFn: () => gh.issues(state),
        meta: { topics: ['issues'] },
      }),
    pull: (number: number) =>
      queryOptions({
        queryKey: ['github', 'pull', number],
        queryFn: () => gh.pull(number),
        meta: { topics: [item(number)], persist: true },
      }),
    issue: (number: number) =>
      queryOptions({
        queryKey: ['github', 'issue', number],
        queryFn: () => gh.issue(number),
        meta: { topics: [item(number)], persist: true },
      }),
    thread: (number: number, kind: 'pr' | 'issue') =>
      queryOptions({
        queryKey: ['github', 'thread', number, kind],
        queryFn: () => gh.thread(number, kind),
        meta: { topics: [item(number)], persist: true },
      }),
    extras: (number: number) =>
      queryOptions({
        queryKey: ['github', 'extras', number],
        queryFn: () => gh.extras(number),
        meta: { topics: [item(number)] },
      }),
    checks: (number: number) =>
      queryOptions({
        queryKey: ['github', 'checks', number],
        queryFn: () => gh.checks(number),
        meta: { topics: [item(number), 'runs'] },
      }),
    pullCommits: (number: number) =>
      queryOptions({
        queryKey: ['github', 'pull-commits', number],
        queryFn: () => gh.pullCommits(number),
        meta: { topics: [item(number)] },
      }),
    reviewState: (number: number) =>
      queryOptions({
        queryKey: ['github', 'review-state', number],
        queryFn: () => gh.reviewState(number),
        meta: { topics: [item(number)] },
      }),
    mergeInfo: (number: number) =>
      queryOptions({
        queryKey: ['github', 'merge-info', number],
        queryFn: () => gh.mergeInfo(number),
        meta: { topics: [item(number), 'runs'] },
      }),
    mergeQueue: (number: number) =>
      queryOptions({
        queryKey: ['github', 'merge-queue', number],
        queryFn: () => gh.mergeQueue(number),
        meta: { topics: [item(number)] },
      }),
    options: () =>
      queryOptions({
        queryKey: ['github', 'options'],
        queryFn: () => gh.options(),
        staleTime: SLOW_MS,
        meta: { persist: true },
      }),
    mentions: () =>
      queryOptions({ queryKey: ['github', 'mentions'], queryFn: () => gh.mentions(), staleTime: SLOW_MS }),
    avatars: () =>
      queryOptions({
        queryKey: ['github', 'avatars'],
        queryFn: () => gh.avatars(),
        staleTime: SLOW_MS,
        meta: { persist: true },
      }),
    defaultBranch: () =>
      queryOptions({
        queryKey: ['github', 'default-branch'],
        queryFn: () => gh.defaultBranch(),
        meta: { persist: true },
      }),
    templates: () =>
      queryOptions({ queryKey: ['github', 'templates'], queryFn: () => gh.templates(), staleTime: SLOW_MS }),
    references: (query: string) =>
      queryOptions({
        queryKey: ['github', 'references', query],
        queryFn: () => gh.references(query),
        staleTime: UNWATCHED_MS,
      }),
    notifications: (all: boolean) =>
      queryOptions({
        queryKey: ['github', 'notifications', all],
        queryFn: () => gh.notifications(all),
        meta: { topics: ['notifications'], persist: true },
      }),
    releases: () =>
      queryOptions({
        queryKey: ['github', 'releases'],
        queryFn: () => gh.releases(),
        staleTime: UNWATCHED_MS,
        meta: { persist: true },
      }),
    discussions: () =>
      queryOptions({
        queryKey: ['github', 'discussions'],
        queryFn: () => gh.discussions(),
        staleTime: UNWATCHED_MS,
        meta: { persist: true },
      }),
    discussion: (number: number) =>
      queryOptions({
        queryKey: ['github', 'discussion', number],
        queryFn: () => gh.discussion(number),
        staleTime: UNWATCHED_MS,
      }),
    security: () =>
      queryOptions({ queryKey: ['github', 'security'], queryFn: () => gh.security(), staleTime: UNWATCHED_MS }),
    runs: () =>
      queryOptions({
        queryKey: ['github', 'runs'],
        queryFn: () => gh.runs(),
        meta: { topics: ['runs'], persist: true },
      }),
    // The palette's search over every pull request and issue; kept, so a restart lists them before GitHub answers.
    index: () =>
      queryOptions({
        queryKey: ['github', 'index'],
        queryFn: () => readIndex(api),
        staleTime: UNWATCHED_MS,
        meta: { topics: ['pulls', 'issues'], persist: true },
      }),
    jobLog: (job: number) =>
      queryOptions({ queryKey: ['github', 'job-log', job], queryFn: () => gh.jobLog(job), staleTime: 15_000 }),
  }
}

export type GitHubQueries = ReturnType<typeof githubQueries>
