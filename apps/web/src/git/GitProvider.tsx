import type { SyncStatus } from '@duck-diff/protocol'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../app/AppProvider'
import type { GitAction } from '../lib/api'

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
}

export function GitProvider({ children }: { children: ReactNode }) {
  const { api, session, graph } = useApp()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState<GitAction | null>(null)

  const refresh = useCallback(() => {
    api.sync().then(setStatus, () => setStatus(null))
  }, [api])

  // Branch and counts follow every change in the repo, from this page or from the terminal.
  useEffect(() => {
    refresh()
    return session.subscribe(() => {
      if (session.get().status === 'ready') refresh()
    })
  }, [refresh, session])

  const run = useCallback<Git['run']>(
    async (action, body, done) => {
      setBusy(action)
      try {
        await api.git(action, body)
        toast(done ?? `${DOING[action]} done`)
        refresh()
        void session.reload()
        if (graph.get().status !== 'idle') void graph.load()
        return true
      } catch (error) {
        toast.error(`${DOING[action]} failed: ${(error as Error).message}`)
        return false
      } finally {
        setBusy(null)
      }
    },
    [api, refresh, session, graph],
  )

  const value = useMemo(() => ({ status, busy, run, refresh }), [status, busy, run, refresh])
  return <GitContext.Provider value={value}>{children}</GitContext.Provider>
}

export function useGit(): Git {
  const value = useContext(GitContext)
  if (!value) throw new Error('useGit needs a GitProvider')
  return value
}
