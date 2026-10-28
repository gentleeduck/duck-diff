import { Button } from '@duck-diff/ui'
import { GitMerge, LoaderCircle, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useGit } from '../git/GitProvider'
import { useSession } from '../hooks/useSession'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import type { LiveState } from '../live/useLiveRefresh'
import { headline, selectConflicts } from '../merge/merge-model'
import { openMerge } from '../merge/open-merge'
import type { JobsState } from '../panel/jobs'
import { relativeTime } from '../sidebar/relative-time'
import type { SessionState } from '../state/session'
import { useStage } from '../state/stage'
import { useApp } from './AppProvider'

const STATUS = {
  open: { label: 'Live', color: 'var(--diff-added)' },
  connecting: { label: 'Connecting', color: 'var(--muted-foreground)' },
  closed: { label: 'Reconnecting', color: 'var(--warning)' },
}

const selectRunning = (state: JobsState) => state.running
const selectLoad = (state: SessionState) => `${state.status}:${state.loadedAt}:${state.error ?? ''}`

// A merge, rebase, pick or revert git is waiting on, on every page, one click from its conflicts.
function OperationStatus() {
  const app = useApp()
  const { show } = useView()
  const { status } = useGit()
  const conflicts = selectConflicts(useStage())
  const count = conflicts ? conflicts.split('\n').length : 0
  const operation = status?.operation ?? null
  if (!operation) return null
  return (
    <Button
      variant="nothing"
      size="none"
      type="button"
      title="Open the conflicts"
      onClick={() => openMerge(app, show, null)}
      className="flex cursor-pointer items-center gap-1.5 justify-start rounded-none whitespace-normal text-warning hover:text-foreground">
      <GitMerge className="size-3.5" />
      {headline(operation, status?.branch ?? null, status?.incoming ?? null)}
      {count ? `, ${count} ${count === 1 ? 'file' : 'files'} to resolve` : ', ready to continue'}
    </Button>
  )
}

export function StatusBar({ live }: { live: LiveState }) {
  const [status = 'idle', loadedAt = '0', ...rest] = useSession(selectLoad).split(':')
  const error = rest.join(':')
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(timer)
  }, [])
  const indicator = STATUS[live.status]
  const { jobs, panel } = useApp()
  const running = useStore(jobs, selectRunning)

  return (
    <>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: indicator.color }} />
        {indicator.label}
      </span>
      {live.repo && (
        <span className="font-mono">
          {live.repo.branch ?? 'detached'}
          {live.repo.head && <span className="ml-1.5 opacity-70">{live.repo.head.slice(0, 7)}</span>}
        </span>
      )}
      <Button
        variant="nothing"
        size="none"
        type="button"
        onClick={panel.toggle}
        title="Commands and output (Ctrl `)"
        className="flex cursor-pointer items-center gap-1.5 hover:text-foreground justify-start rounded-none whitespace-normal">
        {running ? (
          <LoaderCircle className="size-3.5 animate-spin text-tn-blue" />
        ) : (
          <ScrollText className="size-3.5" />
        )}
        {running ? `Running ${running}` : 'Output'}
      </Button>
      <OperationStatus />
      <span className="ml-auto" aria-live="polite">
        {status === 'loading' && 'Loading changes'}
        {status === 'error' && (
          <span className="block max-w-[60vw] truncate text-removed" title={error ?? undefined}>
            Could not load changes: {error}
          </span>
        )}
        {status === 'ready' && `Updated ${relativeTime(Number(loadedAt) / 1000)}`}
      </span>
    </>
  )
}
