import type { PullCommit, PullDetails } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import {
  ArrowLeft,
  Check,
  Eye,
  FileDiff,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  ListChecks,
  Lock,
  LockOpen,
  MessageSquare,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react'
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { useTarget } from '../hooks/useTarget'
import type { ReviewEvent } from '../lib/api'
import { useStore } from '../lib/store'
import type { PullTab } from '../lib/view-url'
import { ChecksList } from './Checks'
import { Avatar, Comment, Composer } from './Conversation'
import { ItemSidebar } from './ItemSidebar'
import { MergeBox } from './MergeBox'
import { ReviewChanges } from './ReviewChanges'
import { sidebarActions } from './SidebarEditors'
import { useGitHub } from './SignIn'
import { StatePill } from './StatePill'
import { ThreadMenu } from './ThreadMenu'
import { ThreadView } from './Timeline'
import { ago } from './time'
import { usePoll } from './usePoll'
import { EditableTitle, useThread } from './useThread'

const Viewer = lazy(() => import('../viewer/Viewer'))

type Tab = PullTab

function TabButton({
  id,
  current,
  onSelect,
  icon,
  label,
  count,
}: {
  id: Tab
  current: Tab
  onSelect(tab: Tab): void
  icon: ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={current === id}
      onClick={() => onSelect(id)}
      className="-mb-px flex cursor-pointer items-center gap-2 border-transparent border-b-2 px-3 py-2 text-muted-foreground hover:text-foreground aria-selected:border-tn-orange aria-selected:text-foreground">
      {icon}
      {label}
      {count !== undefined ? (
        <span className="rounded-full bg-muted px-1.5 text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </button>
  )
}

function Commits({ number }: { number: number }) {
  const { api, graphSelection } = useApp()
  const [commits, setCommits] = useState<PullCommit[] | null>(null)
  useEffect(() => {
    let alive = true
    api.github.pullCommits(number).then(
      (next) => alive && setCommits(next),
      () => alive && setCommits([]),
    )
    return () => {
      alive = false
    }
  }, [api, number])
  if (!commits) return <p className="p-4 text-muted-foreground">Reading commits...</p>
  return (
    <ul className="rounded-md border border-border">
      {commits.map((commit) => (
        <li key={commit.sha} className="flex items-center gap-3 border-border border-b px-4 py-2 last:border-b-0">
          <Avatar user={commit.author} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-foreground">{commit.message.split('\n')[0]}</span>
            <span className="text-muted-foreground">
              {commit.author.login !== 'ghost' ? commit.author.login : commit.authorName} committed {ago(commit.date)}
            </span>
          </span>
          <button
            type="button"
            className="cursor-pointer text-tn-comment hover:text-tn-blue"
            title="Show in the commit graph"
            onClick={() => graphSelection.set(commit.sha)}>
            {commit.sha.slice(0, 7)}
          </button>
        </li>
      ))}
    </ul>
  )
}

// The diff viewer itself, on the fetched head, so a review happens without leaving the pull request.
function Files({ number }: { number: number }) {
  const { api } = useApp()
  const { navigate } = useTarget()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    api.github.fetchPull(number).then(
      (refs) => {
        if (!alive) return
        // Replaces rather than pushes: the tab already has its history entry.
        navigate({ kind: 'range', from: refs.base, to: refs.head, mode: 'merge-base' }, true)
        setReady(true)
      },
      (error: Error) => alive && setFailed(error.message),
    )
    return () => {
      alive = false
    }
  }, [api, number, navigate])
  if (failed) return <p className="p-4 text-removed">Could not fetch the pull request: {failed}</p>
  if (!ready) return <p className="p-4 text-muted-foreground">Fetching the head of #{number}...</p>
  return (
    <div className="h-[calc(100vh-15rem)] overflow-hidden rounded-md border border-border">
      <Suspense fallback={null}>
        <Viewer />
      </Suspense>
    </div>
  )
}

const selectTab = (tab: PullTab) => tab

export default function PullView({ number, onChanged }: { number: number; onChanged(): void }) {
  const { api, pullSelection } = useApp()
  const github = useGitHub()
  const [pull, setPull] = useState<PullDetails | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { pullTab, diffFile } = useApp()
  const tab = useStore(pullTab, selectTab)
  const setTab = (next: Tab) => pullTab.set(next)
  const { thread, draft, reload: reloadThread } = useThread(number)

  const load = useCallback(
    (alive: () => boolean = () => true) =>
      api.github.pull(number).then(
        (next) => alive() && setPull(next),
        (error: Error) => alive() && setFailed(error.message),
      ),
    [api, number],
  )

  useEffect(() => {
    let alive = true
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  usePoll(() => Promise.all([api.github.pull(number).then(setPull, () => {}), reloadThread(true)]), 20_000)

  const act = async (name: string, task: () => Promise<unknown>, done: string) => {
    setBusy(name)
    try {
      await task()
      toast(done)
      await Promise.all([load(), reloadThread()])
      onChanged()
      return true
    } catch (error) {
      toast.error((error as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }

  const back = (
    <button
      type="button"
      onClick={() => pullSelection.set(null)}
      className="flex w-fit cursor-pointer items-center gap-1 text-tn-blue hover:underline">
      <ArrowLeft className="size-4" />
      Pull requests
    </button>
  )

  if (failed) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6">
        {back}
        <p className="text-removed">
          Could not read #{number}: {failed}
        </p>
      </div>
    )
  }
  if (!pull) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6">
        {back}
        <p className="text-muted-foreground">Loading #{number}...</p>
      </div>
    )
  }

  const review = (event: ReviewEvent, body: string, clear: () => void, done: string) =>
    act(event, () => api.github.review(number, event, body).then(clear), done)
  const refreshAll = async () => {
    await Promise.all([load(), reloadThread()])
    onChanged()
  }
  const reload = () => {
    void load()
    void reloadThread()
    onChanged()
  }

  return (
    <article aria-label={`Pull request ${number}`} className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6">
        {back}
        <div className="flex items-start gap-3">
          <EditableTitle
            number={pull.number}
            title={pull.title}
            canEdit={thread?.viewer.canEdit ?? false}
            onChanged={reload}
          />
          <Button size="sm" variant="outline" asChild>
            <a href={pull.url} target="_blank" rel="noreferrer">
              <SquareArrowOutUpRight />
              Open on GitHub
            </a>
          </Button>
          <ThreadMenu
            actions={[
              ...(pull.state === 'open'
                ? [
                    pull.draft
                      ? {
                          label: 'Ready for review',
                          icon: <Eye />,
                          run: () =>
                            void act('draft', () => api.github.setDraft(number, false), 'Marked ready for review'),
                        }
                      : {
                          label: 'Convert to draft',
                          icon: <GitPullRequestDraft />,
                          run: () => void act('draft', () => api.github.setDraft(number, true), 'Converted to a draft'),
                        },
                  ]
                : []),
              pull.locked
                ? {
                    label: 'Unlock conversation',
                    icon: <LockOpen />,
                    run: () => void act('lock', () => api.github.setLocked(number, false), 'Unlocked the conversation'),
                  }
                : {
                    label: 'Lock conversation',
                    icon: <Lock />,
                    run: () => void act('lock', () => api.github.setLocked(number, true), 'Locked the conversation'),
                  },
              ...(!pull.merged
                ? [
                    {
                      label: pull.state === 'open' ? 'Close pull request' : 'Reopen pull request',
                      icon: pull.state === 'open' ? <GitPullRequestClosed /> : <GitPullRequest />,
                      destructive: pull.state === 'open',
                      run: () =>
                        void act(
                          'state',
                          () => api.github.setPullState(number, pull.state === 'open' ? 'closed' : 'open'),
                          pull.state === 'open' ? `Closed #${number}` : `Reopened #${number}`,
                        ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <StatePill kind="pr" state={pull.state} merged={pull.merged} draft={pull.draft} />
          <span className="text-foreground">{pull.author.login}</span>
          <span>
            {pull.merged ? 'merged' : 'wants to merge'} {pull.commits} {pull.commits === 1 ? 'commit' : 'commits'} into
          </span>
          {pull.state === 'open' ? (
            <button
              type="button"
              title="Change the base branch"
              className="cursor-pointer rounded-sm bg-tn-blue/15 px-1.5 text-tn-blue hover:bg-tn-blue/25"
              onClick={async () => {
                const values = await ask.prompt({
                  title: 'Change the base branch',
                  fields: [{ name: 'base', label: 'Base branch', initial: pull.baseRef }],
                  action: 'Change base',
                })
                const base = values?.base
                if (base && base !== pull.baseRef)
                  void act('base', () => api.github.setBase(number, base), `Now merging into ${base}`)
              }}>
              {pull.baseRef}
            </button>
          ) : (
            <code className="rounded-sm bg-tn-blue/15 px-1.5 text-tn-blue">{pull.baseRef}</code>
          )}
          <span>from</span>
          <code className="rounded-sm bg-tn-blue/15 px-1.5 text-tn-blue">{pull.headRef}</code>
        </div>
        <div role="tablist" aria-label="Pull request" className="flex items-end border-border border-b">
          <TabButton
            id="conversation"
            current={tab}
            onSelect={setTab}
            icon={<MessageSquare className="size-4" />}
            label="Conversation"
            count={thread?.timeline.filter((event) => event.kind === 'comment').length}
          />
          <TabButton
            id="commits"
            current={tab}
            onSelect={setTab}
            icon={<GitCommitHorizontal className="size-4" />}
            label="Commits"
            count={pull.commits}
          />
          <TabButton
            id="checks"
            current={tab}
            onSelect={setTab}
            icon={<ListChecks className="size-4" />}
            label="Checks"
          />
          <TabButton
            id="files"
            current={tab}
            onSelect={setTab}
            icon={<FileDiff className="size-4" />}
            label="Files changed"
            count={pull.changedFiles}
          />
          {tab === 'files' ? (
            <span className="ms-auto pb-1.5">
              <ReviewChanges />
            </span>
          ) : null}
          <span className={`${tab === 'files' ? 'ms-3' : 'ms-auto'} pb-2 tabular-nums`}>
            <span className="text-added">+{pull.additions.toLocaleString()}</span>{' '}
            <span className="text-removed">-{pull.deletions.toLocaleString()}</span>
          </span>
        </div>
        {tab === 'commits' ? <Commits number={number} /> : null}
        {tab === 'checks' ? <ChecksList number={number} /> : null}
        {tab === 'files' ? <Files number={number} /> : null}
        {tab === 'conversation' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex min-w-0 flex-col gap-4">
              {thread ? (
                <ThreadView
                  thread={thread}
                  draft={draft}
                  onChanged={() => void reloadThread()}
                  reviewComments={pull.reviewComments}
                  onOpenFile={(path) => {
                    pullTab.set('files')
                    diffFile.set(path)
                  }}
                />
              ) : (
                <Comment author={pull.author} createdAt={pull.createdAt} body={pull.body} />
              )}
              {pull.state === 'open' ? (
                <MergeBox pull={pull} repo={github.status?.repo ?? ''} onChanged={() => refreshAll()} />
              ) : null}
              {pull.merged && pull.sameRepo ? (
                <section
                  aria-label="Merged"
                  className="flex flex-wrap items-center gap-3 rounded-md border border-tn-magenta/50 p-4">
                  <span className="flex size-8 items-center justify-center rounded-full bg-tn-magenta text-background">
                    <GitMerge className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-foreground">
                    Pull request merged.{' '}
                    {pull.headExists ? `The ${pull.headRef} branch can be deleted.` : `${pull.headRef} was deleted.`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === 'branch'}
                    onClick={() =>
                      void act(
                        'branch',
                        () => api.github.setHeadBranch(number, !pull.headExists),
                        pull.headExists ? `Deleted ${pull.headRef}` : `Restored ${pull.headRef}`,
                      )
                    }>
                    {pull.headExists ? 'Delete branch' : 'Restore branch'}
                  </Button>
                </section>
              ) : null}
              <Composer
                draft={draft}
                label="Comment on this pull request"
                onSend={async (body) => {
                  if (!(await act('comment', () => api.github.comment(number, body), 'Commented')))
                    throw new Error('unsent')
                }}>
                {(body, clear) =>
                  pull.state === 'open' ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        loading={busy === 'state'}
                        onClick={() =>
                          void act('state', () => api.github.setPullState(number, 'closed'), `Closed #${number}`)
                        }>
                        <GitPullRequestClosed />
                        Close pull request
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!body.trim()}
                        loading={busy === 'REQUEST_CHANGES'}
                        onClick={() => review('REQUEST_CHANGES', body, clear, 'Requested changes')}>
                        <X />
                        Request changes
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        loading={busy === 'APPROVE'}
                        onClick={() => review('APPROVE', body, clear, 'Approved')}>
                        <Check />
                        Approve
                      </Button>
                    </>
                  ) : null
                }
              </Composer>
            </div>
            <ItemSidebar
              reviewers={pull.reviewers}
              assignees={pull.assignees}
              labels={pull.labels}
              milestone={pull.milestone}
              number={number}
              actions={sidebarActions({
                api,
                number,
                assignees: pull.assignees,
                labels: pull.labels,
                milestone: pull.milestone,
                reviewers: pull.reviewers,
                reload: () => void load(),
              })}
            />
          </div>
        ) : null}
      </div>
    </article>
  )
}
