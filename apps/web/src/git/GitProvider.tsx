import type { SyncStatus } from '@duck-diff/protocol'
import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import { useFirstDiff } from '../hooks/useFirstDiff'
import type { GitAction } from '../lib/api'
import { useRefresh } from '../query/useRefresh'

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

export function GitProvider({ children }: { children: ReactNode }) {
  const { api, session, graph, refs, panel, queries } = useApp()
  const [busy, setBusy] = useState<GitAction | null>(null)
  const topics = useRefresh()
  // Everything a git action can move, on this page and every other.
  const refresh = useCallback(() => void topics('refs', 'index', 'worktree'), [topics])

  // Branch and counts follow every change in the repo, from this page or from the terminal. The first
  // read waits for the diff to load so it never slows the first paint.
  const sync = useQuery({ ...queries.git.sync(), enabled: useFirstDiff() })
  const status = sync.isError ? null : (sync.data ?? null)

  const showOutput = useMemo(() => ({ label: 'Show output', onClick: () => panel.show('output', null) }), [panel])

  const run = useCallback<Git['run']>(
    async (action, body, done) => {
      setBusy(action)
      try {
        const result = await api.git(action, body)
        // A stop on conflicts is not a failure: the files wait in the changes view for resolving.
        if (result.conflicts) toast.warning(`${DOING[action]} stopped on conflicts. Resolve them, then continue.`)
        else if (result.stopped) toast(`${DOING[action]} stopped to let you edit a commit. Continue when ready.`)
        else toast(done ?? `${DOING[action]} done`, { action: showOutput })
        refresh()
        void session.reload()
        void refs.reload()
        if (graph.get().status !== 'idle') void graph.load()
        return true
      } catch (error) {
        // A failure opens what git and the hooks printed, which usually says why.
        panel.show('output', null)
        toast.error(`${DOING[action]} failed: ${(error as Error).message}`)
        return false
      } finally {
        setBusy(null)
      }
    },
    [api, refresh, session, graph, refs, panel, showOutput],
  )

  const value = useMemo(() => ({ status, busy, run, refresh }), [status, busy, run, refresh])
  return <GitContext.Provider value={value}>{children}</GitContext.Provider>
}

export function useGit(): Git {
  const value = useContext(GitContext)
  if (!value) throw new Error('useGit needs a GitProvider')
  return value
}
