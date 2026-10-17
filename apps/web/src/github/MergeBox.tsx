import type { CheckRun, MergeInfo, PullCommit, PullDetails } from '@duck-diff/protocol'
import { Button, Checkbox, Input, Label, Popover, PopoverContent, PopoverTrigger, Textarea } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  CircleX,
  Ellipsis,
  GitMerge,
  GitPullRequestDraft,
  RotateCw,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { BoxSkeleton } from '../app/skeletons'
import type { MergeMethod } from '../lib/api'
import { useRefresh } from '../query/useRefresh'
import { VISIBLE_BOX } from '../viewer/FileActions'
import { LOOK, outcome } from './Checks'

const NO_RUNS: CheckRun[] = []

const METHODS: Record<MergeMethod, { label: string; short: string; detail: string }> = {
  merge: {
    label: 'Create a merge commit',
    short: 'Merge pull request',
    detail: 'All commits from this branch will be added to the base branch via a merge commit.',
  },
  squash: {
    label: 'Squash and merge',
    short: 'Squash and merge',
    detail: 'The commits from this branch will be combined into one commit in the base branch.',
  },
  rebase: {
    label: 'Rebase and merge',
    short: 'Rebase and merge',
    detail: 'The commits from this branch will be rebased and added to the base branch.',
  },
}

type Tone = 'good' | 'bad' | 'wait' | 'muted'

const TONE: Record<Tone, { icon: ReactNode; ring: string }> = {
  good: { icon: <Check className="size-4" />, ring: 'bg-tn-blue text-background' },
  bad: { icon: <CircleX className="size-4" />, ring: 'bg-removed text-background' },
  wait: { icon: <CircleDashed className="size-4" />, ring: 'bg-tn-yellow text-background' },
  muted: { icon: <CircleAlert className="size-4" />, ring: 'bg-muted text-muted-foreground' },
}

// One row of the box: a round status mark, a headline, a quieter line, and what can be done about it.
function Row({
  tone,
  title,
  detail,
  action,
  children,
  open,
  onToggle,
}: {
  tone: Tone
  title: string
  detail?: ReactNode
  action?: ReactNode
  children?: ReactNode
  open?: boolean
  onToggle?(): void
}) {
  return (
    <div className="border-border border-b last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${TONE[tone].ring}`}>
          {TONE[tone].icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold text-foreground">{title}</span>
          {detail ? <span className="text-muted-foreground">{detail}</span> : null}
        </span>
        {action}
        {onToggle ? (
          <IconTool
            label={open ? `Hide ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
            tip={open ? 'Hide' : 'Show all'}
            onClick={onToggle}>
            <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </IconTool>
        ) : null}
      </div>
      {open ? children : null}
    </div>
  )
}

function reviewRow(pull: PullDetails, info: MergeInfo): { tone: Tone; title: string; detail: string } | null {
  const approvals = pull.reviewers.filter((reviewer) => reviewer.state === 'APPROVED').length
  const blocking = pull.reviewers.filter((reviewer) => reviewer.state === 'CHANGES_REQUESTED')
  const need = info.requiredApprovals
  if (info.reviewDecision === 'CHANGES_REQUESTED' || blocking.length)
    return {
      tone: 'bad',
      title: 'Changes requested',
      detail: `${blocking.map((reviewer) => reviewer.login).join(', ') || 'A reviewer'} requested changes`,
    }
  if (info.reviewDecision === 'APPROVED')
    return {
      tone: 'good',
      title: 'Changes approved',
      detail: `${approvals} approving ${approvals === 1 ? 'review' : 'reviews'}${need ? ` (${need} required)` : ''}`,
    }
  if (info.reviewDecision === 'REVIEW_REQUIRED')
    return {
      tone: 'bad',
      title: 'Review required',
      detail: `At least ${need ?? 1} approving ${need === 1 || need === null ? 'review is' : 'reviews are'} required by reviewers with write access.`,
    }
  if (approvals)
    return {
      tone: 'good',
      title: 'Changes approved',
      detail: `${approvals} approving ${approvals === 1 ? 'review' : 'reviews'}`,
    }
  return null
}

function checksRow(runs: CheckRun[]): { tone: Tone; title: string; detail: string } | null {
  if (!runs.length) return null
  const count = (state: ReturnType<typeof outcome>) => runs.filter((run) => outcome(run) === state).length
  const [failed, running, passed, skipped] = [count('failed'), count('running'), count('passed'), count('skipped')]
  const parts = [
    failed && `${failed} failing`,
    running && `${running} in progress`,
    skipped && `${skipped} skipped`,
    passed && `${passed} successful`,
  ].filter(Boolean)
  const detail = `${parts.join(', ')} ${runs.length === 1 ? 'check' : 'checks'}`
  if (failed) return { tone: 'bad', title: 'Some checks were not successful', detail }
  if (running) return { tone: 'wait', title: "Some checks haven't completed yet", detail }
  return { tone: 'good', title: 'All checks have passed', detail }
}

// The commit GitHub would write for each method, following the repo's own message settings.
function defaultCommit(
  method: MergeMethod,
  pull: PullDetails,
  info: MergeInfo,
  commits: PullCommit[],
  headOwner: string,
): { title: string; message: string } {
  if (method === 'squash') {
    const only = commits.length === 1 ? commits[0]?.message.split('\n')[0] : null
    const title = `${info.squashTitle === 'COMMIT_OR_PR_TITLE' && only ? only : pull.title} (#${pull.number})`
    const message =
      info.squashMessage === 'PR_BODY'
        ? pull.body
        : info.squashMessage === 'BLANK'
          ? ''
          : commits.map((commit) => `* ${commit.message}`).join('\n\n')
    return { title, message }
  }
  const title =
    info.mergeTitle === 'PR_TITLE'
      ? `${pull.title} (#${pull.number})`
      : `Merge pull request #${pull.number} from ${headOwner}/${pull.headRef}`
  const message = info.mergeMessage === 'PR_BODY' ? pull.body : info.mergeMessage === 'BLANK' ? '' : pull.title
  return { title, message }
}

// What a failed action on the merge box says, above GitHub's own reason.
const FAILED: Record<string, string> = {
  merge: 'Could not merge',
  auto: 'Could not change auto-merge',
  queue: 'Could not change the merge queue',
  ready: 'Could not mark it ready for review',
  branch: 'Could not change the head branch',
  update: 'Could not update the branch',
  draft: 'Could not change the draft state',
}

export function MergeBox({
  pull,
  repo,
  onChanged,
}: {
  pull: PullDetails
  // owner/name, for the default merge commit title.
  repo: string
  onChanged(): Promise<void> | void
}) {
  const { api, queries } = useApp()
  const number = pull.number
  const info = useQuery(queries.gh.mergeInfo(number)).data ?? null
  const runs = useQuery(queries.gh.checks(number)).data ?? NO_RUNS
  const queue = useQuery(queries.gh.mergeQueue(number)).data ?? null
  const refresh = useRefresh()
  const [method, setMethod] = useState<MergeMethod | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [bypass, setBypass] = useState(false)
  const [deleteAfter, setDeleteAfter] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showChecks, setShowChecks] = useState(false)
  const [showReviews, setShowReviews] = useState(false)
  const [showCli, setShowCli] = useState(false)

  useEffect(() => {
    if (info && method === null) setMethod(info.defaultMethod)
    if (info) setDeleteAfter(info.deleteBranchOnMerge)
  }, [info, method])

  if (!info || !method) {
    return (
      <section aria-label="Merge">
        <BoxSkeleton rows={3} />
      </section>
    )
  }

  const act = async (name: string, task: () => Promise<unknown>, done: string) => {
    setBusy(name)
    try {
      await task()
      toast.success(done)
      await Promise.all([refresh(`item:${number}`), onChanged()])
      return true
    } catch (error) {
      toast.error(FAILED[name] ?? 'GitHub did not take that change', { description: (error as Error).message })
      return false
    } finally {
      setBusy(null)
    }
  }

  const review = reviewRow(pull, info)
  const checks = checksRow(runs)
  const state = info.mergeState
  const conflicts = pull.mergeable === false || state === 'DIRTY'
  const behind = state === 'BEHIND'
  const blocked = state === 'BLOCKED'
  const waiting = checks?.tone === 'wait'
  const unmet = blocked || behind || waiting || state === 'UNSTABLE' || checks?.tone === 'bad'
  const canMerge = !pull.draft && !conflicts && (!blocked || bypass)
  const showAuto = info.autoMergeAllowed && !info.autoMerge && unmet && !conflicts && !pull.draft

  const startConfirm = async () => {
    const commits = method === 'rebase' ? [] : await api.github.pullCommits(number).catch(() => [])
    const fresh = defaultCommit(method, pull, info, commits, repo.split('/')[0] ?? '')
    setTitle(fresh.title)
    setMessage(fresh.message)
    setConfirming(true)
  }
  const merge = async () => {
    const ok = await act(
      'merge',
      () =>
        api.github.merge(
          number,
          method,
          method === 'rebase' ? { sha: pull.headSha } : { title, message, sha: pull.headSha },
        ),
      `Merged #${number}`,
    )
    if (ok) {
      setConfirming(false)
      if (deleteAfter && pull.sameRepo)
        await act('branch', () => api.github.setHeadBranch(number, false), `Deleted ${pull.headRef}`)
    }
  }

  const tone: Tone = pull.draft ? 'muted' : conflicts ? 'bad' : canMerge && !unmet ? 'good' : 'muted'
  const border = {
    good: 'border-tn-blue/70',
    bad: 'border-removed/50',
    wait: 'border-tn-yellow/50',
    muted: 'border-border',
  }[tone]

  return (
    <section aria-label="Merge" className="flex flex-col gap-2">
      <div className="flex gap-3">
        <span
          className={`mt-3 hidden size-10 shrink-0 items-center justify-center rounded-md sm:flex ${TONE[tone].ring}`}>
          {pull.draft ? <GitPullRequestDraft className="size-5" /> : <GitMerge className="size-5" />}
        </span>
        <div className={`min-w-0 flex-1 rounded-md border ${border}`}>
          {review ? (
            <Row
              tone={review.tone}
              title={review.title}
              detail={review.detail}
              open={showReviews}
              onToggle={pull.reviewers.length ? () => setShowReviews(!showReviews) : undefined}>
              <ul className="px-4 pb-3 ps-15">
                {pull.reviewers.map((reviewer) => (
                  <li key={reviewer.login} className="flex items-center gap-2 py-0.5">
                    <span className="min-w-0 flex-1 truncate text-foreground">{reviewer.login}</span>
                    <span className="text-muted-foreground">
                      {reviewer.state === null
                        ? 'Review requested'
                        : reviewer.state === 'APPROVED'
                          ? 'Approved'
                          : reviewer.state === 'CHANGES_REQUESTED'
                            ? 'Requested changes'
                            : 'Commented'}
                    </span>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}
          {checks ? (
            <Row
              tone={checks.tone}
              title={checks.title}
              detail={checks.detail}
              open={showChecks}
              onToggle={() => setShowChecks(!showChecks)}>
              <ul className="max-h-72 overflow-y-auto border-border border-t bg-background px-4">
                {runs.map((run) => (
                  <CheckLine key={`${run.name}:${run.url}`} run={run} />
                ))}
              </ul>
            </Row>
          ) : null}
          {pull.draft ? (
            <Row
              tone="muted"
              title="This pull request is still a work in progress"
              detail="Draft pull requests cannot be merged."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === 'ready'}
                  onClick={() =>
                    void act('ready', () => api.github.setDraft(number, false), 'Marked ready for review')
                  }>
                  Ready for review
                </Button>
              }
            />
          ) : conflicts ? (
            <Row
              tone="bad"
              title="This branch has conflicts that must be resolved"
              detail="Resolve them locally (see the command line instructions below) or on github.com."
              action={
                <Button size="sm" variant="outline" asChild>
                  <a href={`${pull.url}/conflicts`} target="_blank" rel="noreferrer">
                    Resolve conflicts
                  </a>
                </Button>
              }
            />
          ) : behind ? (
            <Row
              tone="muted"
              title="This branch is out-of-date with the base branch"
              detail={`Merge the latest changes from ${pull.baseRef} into this branch.`}
              action={
                <UpdateButton
                  busy={busy === 'update'}
                  onUpdate={(how) =>
                    void act(
                      'update',
                      () => api.github.updateBranch(number, how),
                      how === 'rebase' ? 'Rebasing the branch' : 'Updating the branch',
                    )
                  }
                />
              }
            />
          ) : state === 'UNKNOWN' ? (
            <Row tone="wait" title="Checking for the ability to merge automatically..." />
          ) : (
            <Row tone="good" title="No conflicts with base branch" detail="Merging can be performed automatically." />
          )}

          <div className="flex flex-col gap-3 border-border border-t bg-card/50 px-4 py-3">
            {queue?.enabled && !pull.draft && pull.state === 'open' ? (
              <section aria-label="Merge queue" className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-foreground">
                  {queue.position !== null
                    ? `In the merge queue at position ${queue.position}${queue.state ? ` (${queue.state.toLowerCase()})` : ''}.`
                    : 'This branch merges through a queue: it lands once the checks pass on top of everything ahead of it.'}
                </span>
                {queue.position !== null ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === 'queue'}
                    onClick={() =>
                      void act('queue', () => api.github.setQueued(number, false), 'Removed from the merge queue')
                    }>
                    Remove from queue
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    loading={busy === 'queue'}
                    disabled={conflicts}
                    onClick={() =>
                      void act('queue', () => api.github.setQueued(number, true), 'Added to the merge queue')
                    }>
                    Merge when ready
                  </Button>
                )}
              </section>
            ) : null}
            {info.autoMerge ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-foreground">
                  Auto-merge enabled by {info.autoMerge.by}: this will{' '}
                  {METHODS[info.autoMerge.method].label.toLowerCase()} once all requirements are met.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === 'auto'}
                  onClick={() =>
                    void act('auto', () => api.github.setAutoMerge(number, false, method), 'Auto-merge is off')
                  }>
                  Disable auto-merge
                </Button>
              </div>
            ) : null}
            {blocked && info.canMergeAsAdmin && !pull.draft && !conflicts ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="merge-bypass"
                  checked={bypass}
                  className={VISIBLE_BOX}
                  onCheckedChange={(next) => setBypass(next === true)}
                />
                <Label htmlFor="merge-bypass" className="text-tn-yellow">
                  Merge without waiting for requirements to be met (bypass rules)
                </Label>
              </div>
            ) : null}
            {confirming ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void merge()
                }}>
                {method === 'rebase' ? (
                  <p className="text-muted-foreground">
                    Each commit of {pull.headRef} is replayed onto {pull.baseRef}; no merge commit is written.
                  </p>
                ) : (
                  <>
                    <Input aria-label="Commit title" value={title} onChange={(event) => setTitle(event.target.value)} />
                    <Textarea
                      aria-label="Commit message"
                      rows={6}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </>
                )}
                {pull.sameRepo ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="merge-delete"
                      checked={deleteAfter}
                      className={VISIBLE_BOX}
                      onCheckedChange={(next) => setDeleteAfter(next === true)}
                    />
                    <Label htmlFor="merge-delete">Delete {pull.headRef} after merging</Label>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    loading={busy === 'merge'}
                    disabled={method !== 'rebase' && !title.trim()}>
                    Confirm {METHODS[method].short.toLowerCase()}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex">
                  <Button
                    size="sm"
                    className="rounded-e-none"
                    disabled={!canMerge}
                    variant={canMerge && !unmet ? 'default' : bypass ? 'destructive' : 'secondary'}
                    onClick={() => void startConfirm()}>
                    <GitMerge />
                    {bypass ? `${METHODS[method].short} (bypass)` : METHODS[method].short}
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        aria-label="Choose a merge method"
                        className="rounded-s-none border-s border-background/30 px-2"
                        variant={canMerge && !unmet ? 'default' : bypass ? 'destructive' : 'secondary'}>
                        <ChevronDown />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="flex w-96 flex-col p-1">
                      {info.methods.map((value) => (
                        <Button
                          variant="nothing"
                          size="none"
                          key={value}
                          type="button"
                          onClick={() => setMethod(value)}
                          className="flex cursor-pointer gap-2 rounded-sm p-2 text-start hover:bg-accent justify-start">
                          <span className="w-4 pt-0.5">{value === method ? <Check className="size-4" /> : null}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-foreground">{METHODS[value].label}</span>
                            <span className="text-muted-foreground">{METHODS[value].detail}</span>
                          </span>
                        </Button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>
                {showAuto ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === 'auto'}
                    onClick={() =>
                      void act('auto', () => api.github.setAutoMerge(number, true, method), 'Auto-merge is on')
                    }>
                    Enable auto-merge
                  </Button>
                ) : null}
                <span className="text-muted-foreground">
                  You can also merge this with the command line.{' '}
                  <Button
                    variant="nothing"
                    size="none"
                    type="button"
                    onClick={() => setShowCli(!showCli)}
                    className="inline whitespace-normal rounded-none text-tn-blue underline-offset-2 hover:underline">
                    {showCli ? 'Hide command line instructions.' : 'View command line instructions.'}
                  </Button>
                </span>
              </div>
            )}
            {showCli ? (
              <div className="flex flex-col gap-1 text-muted-foreground">
                <p>Check out this branch and merge it locally:</p>
                <pre className="overflow-x-auto rounded-md bg-tn-dark px-3 py-2 text-foreground">
                  {`git fetch origin pull/${number}/head:${pull.headRef}\ngit switch ${pull.headRef}\ngit merge origin/${pull.baseRef}\n# resolve conflicts, commit, then\ngit push origin ${pull.headRef}`}
                </pre>
              </div>
            ) : null}
            {!pull.draft && !conflicts && !canMerge && !info.canMergeAsAdmin ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <CircleAlert className="size-4" />
                Merging is blocked until the requirements above are met.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {pull.draft ? null : (
        <p className="text-end text-muted-foreground">
          Still in progress?{' '}
          <Button
            variant="nothing"
            size="none"
            type="button"
            disabled={busy === 'draft'}
            onClick={() => void act('draft', () => api.github.setDraft(number, true), 'Converted to draft')}
            className="cursor-pointer text-foreground underline underline-offset-2 hover:text-tn-blue justify-start rounded-none whitespace-normal">
            Convert to draft
          </Button>
        </p>
      )}
    </section>
  )
}

// One check, as GitHub lists them under the summary: its mark, the app's icon, its name and how it went.
function CheckLine({ run }: { run: CheckRun }) {
  const { api } = useApp()
  const state = outcome(run)
  const look = LOOK[state]
  const took =
    run.seconds === null
      ? null
      : run.seconds < 60
        ? `${Math.round(run.seconds)}s`
        : `${Math.floor(run.seconds / 60)}m ${Math.round(run.seconds % 60)}s`
  const note =
    run.summary ??
    (state === 'passed' && took
      ? `Successful in ${took}`
      : state === 'failed' && took
        ? `Failing after ${took}`
        : state === 'running'
          ? 'In progress'
          : state === 'skipped'
            ? 'Skipped'
            : null)
  return (
    <li className="group flex items-center gap-2 border-border border-b py-2 last:border-b-0">
      <look.icon className={`size-4 shrink-0 ${look.className}`} />
      {run.avatar ? (
        <img src={run.avatar} alt="" className="size-5 shrink-0 rounded-sm" />
      ) : (
        <span className="size-5 shrink-0 rounded-sm bg-muted" />
      )}
      <span className="shrink-0 text-foreground">{run.name}</span>
      {note ? (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{note}</span>
      ) : (
        <span className="flex-1" />
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`More for ${run.name}`}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
            <Ellipsis />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-52 flex-col p-1">
          {run.url ? (
            <Button size="sm" variant="ghost" className="justify-start" asChild>
              <a href={run.url} target="_blank" rel="noreferrer">
                <SquareArrowOutUpRight />
                View details
              </a>
            </Button>
          ) : null}
          {state === 'failed' && run.runId !== null ? (
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() =>
                api.github.rerunFailed(run.runId as number).then(
                  () => toast('Re-running the failed jobs', { description: 'The checks above update as they finish.' }),
                  (error: Error) => toast.error('Could not re-run the failed jobs', { description: error.message }),
                )
              }>
              <RotateCw />
              Re-run failed jobs
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </li>
  )
}

function UpdateButton({ busy, onUpdate }: { busy: boolean; onUpdate(how: 'merge' | 'rebase'): void }) {
  return (
    <div className="flex">
      <Button size="sm" variant="outline" className="rounded-e-none" loading={busy} onClick={() => onUpdate('merge')}>
        Update branch
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            aria-label="Choose how to update"
            className="rounded-s-none border-s-0 px-2">
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-80 flex-col p-1">
          <Button
            variant="nothing"
            size="none"
            type="button"
            onClick={() => onUpdate('merge')}
            className="flex cursor-pointer flex-col rounded-sm p-2 text-start hover:bg-accent justify-start">
            <span className="text-foreground">Update with merge commit</span>
            <span className="text-muted-foreground">Merge the base branch into this one.</span>
          </Button>
          <Button
            variant="nothing"
            size="none"
            type="button"
            onClick={() => onUpdate('rebase')}
            className="flex cursor-pointer flex-col rounded-sm p-2 text-start hover:bg-accent justify-start">
            <span className="text-foreground">Update with rebase</span>
            <span className="text-muted-foreground">
              Replay this branch's commits on top of the base. Rewrites history.
            </span>
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
