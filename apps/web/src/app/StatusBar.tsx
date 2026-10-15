import { useEffect, useState } from 'react'
import { useSession } from '../hooks/useSession'
import type { LiveState } from '../live/useLiveRefresh'
import { relativeTime } from '../sidebar/relative-time'
import type { SessionState } from '../state/session'

const STATUS = {
  open: { label: 'Live', color: 'var(--diff-added)' },
  connecting: { label: 'Connecting', color: 'var(--muted-foreground)' },
  closed: { label: 'Reconnecting', color: 'var(--warning)' },
}

const selectLoad = (state: SessionState) => `${state.status}:${state.loadedAt}:${state.error ?? ''}`

export function StatusBar({ live }: { live: LiveState }) {
  const [status = 'idle', loadedAt = '0', ...rest] = useSession(selectLoad).split(':')
  const error = rest.join(':')
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(timer)
  }, [])
  const indicator = STATUS[live.status]

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
      <span className="ml-auto" aria-live="polite">
        {status === 'loading' && 'Loading changes'}
        {status === 'error' && <span className="text-removed">Could not load changes: {error}</span>}
        {status === 'ready' && `Updated ${relativeTime(Number(loadedAt) / 1000)}`}
      </span>
    </>
  )
}
