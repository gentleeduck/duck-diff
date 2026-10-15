import type { GitHubUser, Options, Reviewer } from '@duck-diff/protocol'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import type { AppContextValue } from '../app/AppProvider'
import { Avatar } from './Conversation'
import { Picker } from './Picker'

export type Reads = Pick<AppContextValue, 'api' | 'queries' | 'queryClient'>

// Read once and shared by every picker, through the query cache.
export const options = (app: Reads): Promise<Options> => app.queryClient.fetchQuery(app.queries.gh.options())

const people = (app: Reads) => async () =>
  (await options(app)).people.map((user) => ({ value: user.login, label: user.login, icon: <Avatar user={user} /> }))

// The pickers for a conversation's sidebar; each sends one change and then rereads the page.
export function sidebarActions({
  app,
  number,
  assignees,
  labels,
  milestone,
  reviewers,
  reload,
}: {
  app: Reads
  number: number
  assignees: GitHubUser[]
  labels: { name: string }[]
  milestone: string | null
  reviewers?: Reviewer[]
  reload(): void
}) {
  const { api } = app
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
        load={async () => {
          const found = await options(app)
          const [owner] = (await app.queryClient.fetchQuery(app.queries.gh.status())).repo?.split('/') ?? ['']
          return [
            ...(await people(app)()),
            ...found.teams.map((team) => ({
              value: `${owner}/${team.slug}`,
              label: `${owner}/${team.slug}`,
              detail: team.name,
              icon: <Users className="size-4 shrink-0" />,
            })),
          ]
        }}
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
        load={people(app)}
        selected={assignees.map((user) => user.login)}
        onApply={(next) => void apply(api.github.editThread(number, { assignees: next }), 'Updated the assignees')}
      />
    ),
    labels: (
      <Picker
        title="Labels"
        load={async () =>
          (await options(app)).labels.map((label) => ({
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
        load={async () => (await options(app)).milestones.map((entry) => ({ value: entry.title, label: entry.title }))}
        selected={milestone ? [milestone] : []}
        onApply={async (next) => {
          const chosen = (await options(app)).milestones.find((entry) => entry.title === next[0])
          void apply(
            api.github.editThread(number, { milestone: chosen?.number ?? null }),
            chosen ? 'Set the milestone' : 'Cleared the milestone',
          )
        }}
      />
    ),
  }
}
