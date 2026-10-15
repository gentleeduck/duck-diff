import type { GitHubUser, Options, Reviewer } from '@duck-diff/protocol'
import { toast } from 'sonner'
import type { Api } from '../lib/api'
import { Avatar } from './Conversation'
import { Picker } from './Picker'

const cache = new WeakMap<Api, Promise<Options>>()

// Read once per page and shared by every picker.
function options(api: Api): Promise<Options> {
  let promise = cache.get(api)
  if (!promise) {
    promise = api.github.options()
    promise.catch(() => cache.delete(api))
    cache.set(api, promise)
  }
  return promise
}

const people = (api: Api) => async () =>
  (await options(api)).people.map((user) => ({ value: user.login, label: user.login, icon: <Avatar user={user} /> }))

// The pickers for a conversation's sidebar; each sends one change and then rereads the page.
export function sidebarActions({
  api,
  number,
  assignees,
  labels,
  milestone,
  reviewers,
  reload,
}: {
  api: Api
  number: number
  assignees: GitHubUser[]
  labels: { name: string }[]
  milestone: string | null
  reviewers?: Reviewer[]
  reload(): void
}) {
  const apply = (task: Promise<unknown>, done: string) =>
    task.then(
      () => {
        toast(done)
        reload()
      },
      (error: Error) => toast.error(error.message),
    )
  return {
    reviewers: reviewers ? (
      <Picker
        title="Reviewers"
        load={people(api)}
        selected={reviewers.filter((reviewer) => reviewer.state === null).map((reviewer) => reviewer.login)}
        onApply={(next) => {
          const before = new Set(
            reviewers.filter((reviewer) => reviewer.state === null).map((reviewer) => reviewer.login),
          )
          const add = next.filter((login) => !before.has(login))
          const remove = [...before].filter((login) => !next.includes(login))
          void apply(api.github.requestReviewers(number, { add, remove }), 'Updated the reviewers')
        }}
      />
    ) : undefined,
    assignees: (
      <Picker
        title="Assignees"
        load={people(api)}
        selected={assignees.map((user) => user.login)}
        onApply={(next) => void apply(api.github.editThread(number, { assignees: next }), 'Updated the assignees')}
      />
    ),
    labels: (
      <Picker
        title="Labels"
        load={async () =>
          (await options(api)).labels.map((label) => ({
            value: label.name,
            label: label.name,
            detail: label.description || undefined,
            icon: <span className="size-3 shrink-0 rounded-full" style={{ background: `#${label.color}` }} />,
          }))
        }
        selected={labels.map((label) => label.name)}
        onApply={(next) => void apply(api.github.editThread(number, { labels: next }), 'Updated the labels')}
      />
    ),
    milestone: (
      <Picker
        title="Milestone"
        single
        load={async () => (await options(api)).milestones.map((entry) => ({ value: entry.title, label: entry.title }))}
        selected={milestone ? [milestone] : []}
        onApply={async (next) => {
          const chosen = (await options(api)).milestones.find((entry) => entry.title === next[0])
          void apply(
            api.github.editThread(number, { milestone: chosen?.number ?? null }),
            chosen ? 'Set the milestone' : 'Cleared the milestone',
          )
        }}
      />
    ),
  }
}
