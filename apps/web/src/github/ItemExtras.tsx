import { Badge, Button } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Bell, BellOff, Pin, PinOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { useView } from '../hooks/useView'
import { useRefresh } from '../query/useRefresh'
import { IssueIcon } from './IssuesList'
import { Section } from './ItemSidebar'
import { PullIcon } from './PullsList'

// The lower half of GitHub's sidebar: linked work, projects, notifications, and the issue-only actions.
export function ItemExtras({ number }: { number: number }) {
  const { api, pullSelection, issueSelection, queries } = useApp()
  const { show } = useView()
  const extras = useQuery(queries.gh.extras(number)).data ?? null
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)

  if (!extras) return null

  const change = async (task: Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await task
      toast(done)
      await refresh(`item:${number}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const open = (pull: boolean, target: number) => {
    if (pull) {
      show('prs')
      pullSelection.set(target)
    } else {
      show('issues')
      issueSelection.set(target)
    }
  }
  const transfer = async () => {
    const answer = await ask.prompt({
      title: `Transfer #${number}`,
      body: 'Moves this issue, its comments and its history to another repository you can write to.',
      fields: [{ name: 'repo', label: 'Repository', placeholder: 'owner/name' }],
      action: 'Transfer issue',
    })
    if (!answer) return
    setBusy(true)
    try {
      const moved = await api.github.transfer(number, answer.repo ?? '')
      toast(`Moved to ${answer.repo}#${moved.number}`)
      issueSelection.set(null)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const subscribed = extras.subscription === 'SUBSCRIBED'

  return (
    <>
      <Section title="Development">
        {extras.linked.length ? (
          <ul className="flex flex-col gap-1.5">
            {extras.linked.map((item) => (
              <li key={item.number}>
                <button
                  type="button"
                  onClick={() => open(item.pull, item.number)}
                  className="flex w-full cursor-pointer items-start gap-2 text-start text-foreground hover:text-tn-blue">
                  <span className="pt-0.5">
                    {item.pull ? (
                      <PullIcon
                        pull={{
                          state: item.state === 'open' ? 'open' : 'closed',
                          merged: item.state === 'merged',
                          draft: false,
                        }}
                      />
                    ) : (
                      <IssueIcon state={item.state === 'open' ? 'open' : 'closed'} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.title} <span className="text-muted-foreground">#{item.number}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nothing linked yet</p>
        )}
      </Section>
      <Section title="Projects">
        {extras.projects === null ? (
          <p className="text-muted-foreground">Needs the read:project scope on the token.</p>
        ) : extras.projects.length ? (
          <ul className="flex flex-col gap-1.5">
            {extras.projects.map((project) => (
              <li key={project.url} className="flex items-center gap-2">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-foreground hover:text-tn-blue">
                  {project.title}
                </a>
                {project.status ? (
                  <Badge variant="outline" size="sm">
                    {project.status}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None yet</p>
        )}
      </Section>
      <Section title="Notifications">
        <Button
          size="sm"
          variant="outline"
          loading={busy}
          onClick={() =>
            void change(api.github.setSubscribed(number, !subscribed), subscribed ? 'Unsubscribed' : 'Subscribed')
          }>
          {subscribed ? <BellOff /> : <Bell />}
          {subscribed ? 'Unsubscribe' : 'Subscribe'}
        </Button>
        <p className="text-muted-foreground">
          {subscribed
            ? "You're receiving notifications from this thread."
            : extras.subscription === 'IGNORED'
              ? "You're ignoring this repository."
              : "You're not receiving notifications from this thread."}
        </p>
      </Section>
      {extras.pinned !== null ? (
        <Section title="Issue">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 justify-start px-0 hover:bg-transparent hover:text-tn-blue has-[>svg]:px-0"
            disabled={busy}
            onClick={() =>
              void change(
                api.github.setPinned(number, !extras.pinned),
                extras.pinned ? 'Unpinned' : 'Pinned to the repository',
              )
            }>
            {extras.pinned ? <PinOff /> : <Pin />}
            {extras.pinned ? 'Unpin issue' : 'Pin issue'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 justify-start px-0 hover:bg-transparent hover:text-tn-blue has-[>svg]:px-0"
            disabled={busy}
            onClick={() => void transfer()}>
            <ArrowRightLeft />
            Transfer issue
          </Button>
        </Section>
      ) : null}
    </>
  )
}
