import type { Notification as GitHubNotification, WorkflowRun } from '@duck-diff/protocol'

export interface Notice {
  key: string
  title: string
  body: string
}

// What deserves a desktop notice since the last look: review requests, and failed runs I started.
// The first look only remembers what is there, so opening the page does not replay old news.
export function newNotices(
  seen: Set<string> | null,
  notifications: readonly GitHubNotification[],
  runs: readonly WorkflowRun[],
  me: string | null,
): { notices: Notice[]; seen: Set<string> } {
  const current: Notice[] = [
    ...notifications
      .filter((entry) => entry.unread && entry.reason === 'review_requested')
      .map((entry) => ({
        key: `review:${entry.id}:${entry.updatedAt}`,
        title: 'Review requested',
        body: entry.number ? `#${entry.number} ${entry.title}` : entry.title,
      })),
    ...runs
      .filter((run) => run.conclusion === 'failure' && me !== null && run.actor.login === me)
      .map((run) => ({ key: `run:${run.id}`, title: `${run.name} failed`, body: `${run.title} on ${run.branch}` })),
  ]
  const next = new Set(current.map((notice) => notice.key))
  if (seen === null) return { notices: [], seen: next }
  return { notices: current.filter((notice) => !seen.has(notice.key)), seen: new Set([...seen, ...next]) }
}
