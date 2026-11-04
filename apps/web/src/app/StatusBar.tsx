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
  const text = `${headline(operation, status?.branch ?? null, status?.incoming ?? null)}${
    count ? `, ${count} ${count === 1 ? 'file' : 'files'} to resolve` : ', ready to continue'
  }`
  // Cut short on a narrow window, so the whole line is on hover.
  return (
    <Button
      variant="nothing"
      size="none"
      type="button"
      title={`${text}. Open the conflicts`}
      onClick={() => openMerge(app, show, null)}
      className="flex min-w-0 shrink cursor-pointer items-center gap-1.5 justify-start rounded-none text-warning hover:text-foreground">
      <GitMerge className="size-3.5" />
      <span className="min-w-0 truncate">{text}</span>
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

  // One line however long the branch: the branch and a running merge are cut short, the rest never shrinks.
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: indicator.color }} />
        {indicator.label}
      </span>
      {live.repo && (
        // Never narrower than the hash beside the name (7ch and its margin), so the name gives way and the hash stays.
        <span
          className={`flex font-mono ${live.repo.head ? 'min-w-[calc(7ch+0.375rem)]' : 'min-w-0'}`}
          title={live.repo.branch ?? undefined}>
          <span className="min-w-0 truncate">{live.repo.branch ?? 'detached'}</span>
          {live.repo.head && <span className="ml-1.5 shrink-0 opacity-70">{live.repo.head.slice(0, 7)}</span>}
        </span>
      )}
      <Button
        variant="nothing"
        size="none"
        type="button"
        onClick={panel.toggle}
        title="Commands and output (Ctrl `)"
        className="flex cursor-pointer items-center gap-1.5 hover:text-foreground justify-start rounded-none">
        {running ? (
          <LoaderCircle className="size-3.5 animate-spin text-tn-blue" />
        ) : (
          <ScrollText className="size-3.5" />
        )}
        {running ? `Running ${running}` : 'Output'}
      </Button>
      <OperationStatus />
      <span className="ml-auto shrink-0 whitespace-nowrap" aria-live="polite">
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
