import type { SyncStatus } from '@duck-diff/protocol'
import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useFirstDiff } from '../hooks/useFirstDiff'
import type { GitAction } from '../lib/api'
import { useStore } from '../lib/store'
import { headline } from '../merge/merge-model'
import { openMerge } from '../merge/open-merge'
import type { JobsState } from '../panel/jobs'
import { useRefresh } from '../query/useRefresh'
import { failureReason } from './failure-reason'
import { followJobs } from './follow-jobs'

interface Git {
  status: SyncStatus | null
  // The action running now, so its button can show progress and others wait.
  busy: GitAction | null
  run(action: GitAction, body?: unknown, done?: string): Promise<boolean>
  refresh(): void
}

const GitContext = createContext<Git | null>(null)

const DOING: Record<GitAction, string> = {
  commit: 'Commit',
  push: 'Push',
  pull: 'Pull',
  fetch: 'Fetch',
  switch: 'Switch branch',
  checkout: 'Checkout',
  stash: 'Stash',
  'stash-apply': 'Apply stash',
  'stash-drop': 'Drop stash',
  merge: 'Merge',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert',
  abort: 'Abort',
  'branch-delete': 'Delete branch',
  'stage-all': 'Stage all',
  'unstage-all': 'Unstage all',
  resolve: 'Resolve',
  'mark-resolved': 'Mark resolved',
  'resolve-text': 'Resolve',
  'rebase-interactive': 'Rebase',
  fixup: 'Fixup',
  'cherry-pick-range': 'Cherry-pick',
  'bisect-mark': 'Bisect',
  'bisect-run': 'Bisect run',
  'bisect-reset': 'Stop bisecting',
  'worktree-add': 'Add worktree',
  'worktree-remove': 'Remove worktree',
  'worktree-prune': 'Prune worktrees',
  'submodule-update': 'Update submodules',
  'submodule-sync': 'Sync submodules',
  'undo-commit': 'Undo commit',
  reset: 'Reset',
  'branch-rename': 'Rename branch',
  'set-upstream': 'Set upstream',
  'force-push': 'Force push',
  'remote-branch-delete': 'Delete remote branch',
  track: 'Check out',
  'tag-create': 'Create tag',
  'tag-delete': 'Delete tag',
  'tag-push': 'Push tags',
  'remote-add': 'Add remote',
  'remote-remove': 'Remove remote',
  'fetch-remote': 'Fetch',
  rebase: 'Rebase',
  continue: 'Continue',
  skip: 'Skip',
  clean: 'Clean',
  'stash-staged': 'Stash staged',
}

const isGitAction = (action: string | undefined): action is GitAction => Boolean(action && action in DOING)
// The server's running action, so a reloaded page or another tab shows the push still going.
const selectRunning = (state: JobsState) =>
  (state.jobs.find((job) => job.status === 'running' && isGitAction(job.action))?.action as GitAction) ?? null

// What an operation is called when it stops for the user.
const STOPPED: Record<NonNullable<SyncStatus['operation']>, string> = {
  merge: 'Merge',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert',
  rebase: 'Rebase',
}

export function GitProvider({ children }: { children: ReactNode }) {
  const { api, session, graph, refs, panel, queries, jobs, mergeFile, view } = useApp()
  const [started, setStarted] = useState<GitAction | null>(null)
  const running = useStore(jobs, selectRunning)
  const busy = started ?? running
  const mine = useRef<GitAction | null>(null)
  const topics = useRefresh()
  // Everything a git action can move, on this page and every other.
  const refresh = useCallback(() => void topics('refs', 'index', 'worktree'), [topics])

  // Branch and counts follow every change in the repo, from this page or from the terminal. The first
  // read waits for the diff to load so it never slows the first paint.
  const sync = useQuery({ ...queries.git.sync(), enabled: useFirstDiff() })
  const status = sync.isError ? null : (sync.data ?? null)

  const showOutput = useMemo(() => ({ label: 'Show output', onClick: () => panel.show('output', null) }), [panel])
  const resolve = useMemo(
    () => ({ label: 'Resolve', onClick: () => openMerge({ mergeFile }, view.set, null) }),
    [mergeFile, view],
  )
  // Set when this page's own action stopped on conflicts, which run has already said.
  const expected = useRef(false)

  const settle = useCallback(() => {
    refresh()
    void session.reload()
    void refs.reload()
    if (graph.get().status !== 'idle') void graph.load()
  }, [refresh, session, refs, graph])

  const run = useCallback<Git['run']>(
    async (action, body, done) => {
      mine.current = action
      setStarted(action)
      try {
        const result = await api.git(action, body)
        // A stop on conflicts is not a failure: the files wait in the changes view for resolving.
        if (result.conflicts) {
          expected.current = true
          toast.warning(`${DOING[action]} stopped on conflicts`, {
            description: 'Resolve them, then continue.',
            action: resolve,
          })
        } else if (result.stopped)
          toast(`${DOING[action]} paused`, { description: 'It stopped to let you edit a commit. Continue when ready.' })
        else toast.success(done ?? `${DOING[action]} done`, { action: showOutput })
        settle()
        return true
      } catch (error) {
        // A failure opens what git and the hooks printed, which usually says why.
        panel.show('output', null)
        toast.error(`${DOING[action]} failed`, {
          description: failureReason((error as Error).message),
          action: showOutput,
        })
        return false
      } finally {
        mine.current = null
        setStarted(null)
      }
    },
    [api, settle, panel, showOutput, resolve],
  )

  // An operation started without this page's buttons (in its terminal, or another) is announced the moment git
  // reports it, and the bottom panel turns to its Merge tab.
  const operation = status?.operation ?? null
  const seen = useRef<SyncStatus['operation'] | undefined>(undefined)
  useEffect(() => {
    if (!sync.data) return
    const before = seen.current
    seen.current = operation
    if (before === undefined || !operation || before === operation) return
    if (expected.current || mine.current) {
      expected.current = false
      return
    }
    panel.show('merge')
    toast.warning(`${STOPPED[operation]} stopped`, {
      description: `${headline(operation, status?.branch ?? null, status?.incoming ?? null)}. Resolve the conflicts, then continue.`,
      action: resolve,
    })
  }, [sync.data, operation, status, panel, resolve])

  // An action this page did not start (before a reload, or in another tab) still ends here the way run does.
  useEffect(
    () =>
      followJobs(
        jobs,
        (job) => isGitAction(job.action),
        () => mine.current,
        (job) => {
          const doing = DOING[job.action as GitAction]
          if (job.status === 'ok') toast.success(`${doing} done`, { action: showOutput })
          else {
            panel.show('output', null)
            toast.error(`${doing} failed`, { description: failureReason(job.error ?? ''), action: showOutput })
          }
          settle()
        },
      ),
    [jobs, panel, showOutput, settle],
  )

  const value = useMemo(() => ({ status, busy, run, refresh }), [status, busy, run, refresh])
  return <GitContext.Provider value={value}>{children}</GitContext.Provider>
}

export function useGit(): Git {
  const value = useContext(GitContext)
  if (!value) throw new Error('useGit needs a GitProvider')
  return value
}
