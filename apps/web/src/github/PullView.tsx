import { type DiffTarget, targetKey } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Copy,
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
} from 'lucide-react'
import { type ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { KeepAlive } from '../app/KeepAlive'
import { DiffSkeleton, ListRowsSkeleton, ThreadSkeleton } from '../app/skeletons'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import type { ReviewEvent } from '../lib/api'
import { useStore } from '../lib/store'
import type { PullTab } from '../router/place'
import Viewer from '../viewer/Viewer'
import { ChecksList } from './Checks'
import { CodeMenu } from './CodeMenu'
import { Avatar, Comment, Composer } from './Conversation'
import { ItemSidebar } from './ItemSidebar'
import { MergeBox } from './MergeBox'
import { Picker } from './Picker'
import { ReviewChanges } from './ReviewChanges'
import { sidebarActions } from './SidebarEditors'
import { useGitHub } from './SignIn'
import { StatePill } from './StatePill'
import { ThreadMenu } from './ThreadMenu'
import { ThreadView } from './Timeline'
import { ago } from './time'
import { EditTitleButton, ThreadTitle, useThread } from './useThread'

type Tab = PullTab

// GitHub's five squares beside a diff stat: green for added lines, red for removed, in proportion.
function DiffBlocks({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions
  const green = total ? Math.round((additions / total) * 5) : 0
  const red = total ? Math.min(5 - green, Math.round((deletions / total) * 5)) : 0
  return (
    <span aria-hidden className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`size-2 rounded-[1px] ${i < green ? 'bg-added' : i < green + red ? 'bg-removed' : 'bg-muted'}`}
        />
      ))}
    </span>
  )
}

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
  const { queries, graphSelection } = useApp()
  const { data: commits, isError } = useQuery(queries.gh.pullCommits(number))
  if (isError) return <p className="p-4 text-removed">Could not read the commits.</p>
  if (!commits)
    return (
      <div className="rounded-md border border-border">
        <ListRowsSkeleton twoLines avatar />
      </div>
    )
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

// The diff viewer itself, on the fetched head, so a review happens without leaving the pull request. It shows
// here only: the changes view and its tabs keep their own comparison until "Open in diff".
function Files({ number, head }: { number: number; head: string }) {
  const { session, queries } = useApp()
  const { navigate } = useTarget()
  const { show } = useView()
  const refs = useQuery(queries.gh.pullRefs(number, head))
  const target: DiffTarget | null = refs.data
    ? { kind: 'range', from: refs.data.base, to: refs.data.head, mode: 'merge-base' }
    : null
  const key = target ? targetKey(target) : null
  // The session keeps recent diffs, so coming back to this tab shows the one it had at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the target
  useEffect(() => {
    if (target && targetKey(session.get().target) !== key) void session.load(target)
  }, [key, session])
  if (refs.error) return <p className="p-4 text-removed">Could not fetch the pull request: {refs.error.message}</p>
  if (!target) return <DiffSkeleton />
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigate(target)
            show('changes')
          }}>
          <SquareArrowOutUpRight />
          Open in diff
        </Button>
      </div>
      <div className="h-[calc(100vh-17rem)] overflow-hidden rounded-md border border-border">
        <Suspense fallback={<DiffSkeleton />}>
          <Viewer />
        </Suspense>
      </div>
    </div>
  )
}

const selectTab = (tab: PullTab) => tab

export default function PullView({ number, onChanged }: { number: number; onChanged(): void }) {
  const { api, pullSelection, queries, queryClient } = useApp()
  const github = useGitHub()
  const { data: pull, error } = useQuery(queries.gh.pull(number))
  const failed = error ? error.message : null
  const [busy, setBusy] = useState<string | null>(null)
  const { pullTab, diffFile } = useApp()
  const tab = useStore(pullTab, selectTab)
  const setTab = (next: Tab) => pullTab.set(next)
  const { thread, draft, reload: reloadThread } = useThread(number, 'pr')
  // Review changes works from every tab, so the pull request's review state reads with the page.
  const { pullReview } = useApp()
  useEffect(() => {
    pullReview.load(number).catch(() => {})
  }, [pullReview, number])
  const page = useRef<HTMLElement>(null)

  // The conversation is ready once its thread has read; the other tabs carry their own heights.
  useScrollMemory(page, pull && (tab !== 'conversation' || thread) ? `pull:${number}:${tab}` : null)

  // GitHub merges only into branches it has, so the choices are the remote's, newest first.
  const baseBranches = async (head: string) => {
    const refs = await queryClient.fetchQuery(queries.git.refs())
    return refs
      .filter((ref) => ref.kind === 'remote' && ref.name.startsWith('origin/') && ref.name !== 'origin/HEAD')
      .sort((a, b) => b.committedAt - a.committedAt)
      .map((ref) => ref.name.slice('origin/'.length))
      .filter((name) => name !== head)
      .map((name) => ({ value: name, label: name }))
  }
  const act = async (name: string, task: () => Promise<unknown>, done: string) => {
    setBusy(name)
    try {
      await task()
      toast(done)
      await reloadThread()
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
      <div className="flex w-full flex-col gap-3 p-6">
        {back}
        <p className="text-removed">
          Could not read #{number}: {failed}
        </p>
      </div>
    )
  }
  if (!pull) {
    return (
      <div className="flex w-full flex-col gap-3 p-6">
        {back}
        <ThreadSkeleton tabs />
      </div>
    )
  }

  const _review = (event: ReviewEvent, body: string, clear: () => void, done: string) =>
    act(event, () => api.github.review(number, event, body).then(clear), done)
  const reload = () => {
    void reloadThread()
    onChanged()
  }

  return (
    <article ref={page} aria-label={`Pull request ${number}`} className="h-full overflow-y-auto">
      <div className="flex w-full flex-col gap-3 p-6">
        {back}
        <div className="flex items-start gap-3">
          <ThreadTitle number={pull.number} title={pull.title} />
          <div className="mt-1 flex shrink-0 items-center gap-2">
            {thread?.viewer.canEdit ? (
              <EditTitleButton number={pull.number} title={pull.title} onChanged={reload} />
            ) : null}
            <CodeMenu pull={pull} />
            <ThreadMenu
              actions={[
                {
                  label: 'Open on GitHub',
                  icon: <SquareArrowOutUpRight />,
                  run: () => window.open(pull.url, '_blank', 'noreferrer'),
                },
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
                            run: () =>
                              void act('draft', () => api.github.setDraft(number, true), 'Converted to a draft'),
                          },
                    ]
                  : []),
                pull.locked
                  ? {
                      label: 'Unlock conversation',
                      icon: <LockOpen />,
                      run: () =>
                        void act('lock', () => api.github.setLocked(number, false), 'Unlocked the conversation'),
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
        </div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <StatePill kind="pr" state={pull.state} merged={pull.merged} draft={pull.draft} />
          <span className="text-foreground">{pull.author.login}</span>
          <span>
            {pull.merged ? 'merged' : 'wants to merge'} {pull.commits} {pull.commits === 1 ? 'commit' : 'commits'} into
          </span>
          {pull.state === 'open' ? (
            <Picker
              title="Base branch"
              single
              live
              selected={[pull.baseRef]}
              load={() => baseBranches(pull.headRef)}
              onApply={([base]) => {
                if (base && base !== pull.baseRef)
                  void act('base', () => api.github.setBase(number, base), `Now merging into ${base}`)
              }}
              trigger={
                <button
                  type="button"
                  title="Change the base branch"
                  className="cursor-pointer rounded-sm bg-tn-blue/15 px-1.5 text-tn-blue hover:bg-tn-blue/25">
                  {pull.baseRef}
                </button>
              }
            />
          ) : (
            <code className="rounded-sm bg-tn-blue/15 px-1.5 text-tn-blue">{pull.baseRef}</code>
          )}
          <span>from</span>
          <code className="rounded-sm bg-tn-blue/15 px-1.5 text-tn-blue">{pull.headRef}</code>
          <IconTool
            label={`Copy ${pull.headRef}`}
            tip="Copy branch name"
            onClick={() =>
              void navigator.clipboard.writeText(pull.headRef).then(() => toast('Copied the branch name'))
            }>
            <Copy />
          </IconTool>
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
          <span className="ms-auto flex items-center gap-3 pb-1.5">
            <span className="flex items-center gap-1.5 tabular-nums">
              <span className="text-added">+{pull.additions.toLocaleString()}</span>
              <span className="text-removed">-{pull.deletions.toLocaleString()}</span>
              <DiffBlocks additions={pull.additions} deletions={pull.deletions} />
            </span>
            {pull.state === 'open' ? <ReviewChanges /> : null}
          </span>
        </div>
        {/* Each tab draws the first time it opens and is kept, paused, while another one shows. */}
        <KeepAlive active={tab === 'commits'}>
          <Commits number={number} />
        </KeepAlive>
        <KeepAlive active={tab === 'checks'}>
          <ChecksList number={number} />
        </KeepAlive>
        <KeepAlive active={tab === 'files'}>
          <Files number={number} head={pull.headSha} />
        </KeepAlive>
        <KeepAlive active={tab === 'conversation'}>
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
                <MergeBox pull={pull} repo={github.status?.repo ?? ''} onChanged={reload} />
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
                {() =>
                  pull.merged ? null : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={busy === 'state'}
                      onClick={() =>
                        void act(
                          'state',
                          () => api.github.setPullState(number, pull.state === 'open' ? 'closed' : 'open'),
                          pull.state === 'open' ? `Closed #${number}` : `Reopened #${number}`,
                        )
                      }>
                      {pull.state === 'open' ? <GitPullRequestClosed className="text-removed" /> : <GitPullRequest />}
                      {pull.state === 'open' ? 'Close pull request' : 'Reopen pull request'}
                    </Button>
                  )
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
                app: { api, queries, queryClient },
                number,
                assignees: pull.assignees,
                labels: pull.labels,
                milestone: pull.milestone,
                reviewers: pull.reviewers,
                reload,
              })}
            />
          </div>
        </KeepAlive>
      </div>
    </article>
  )
}
