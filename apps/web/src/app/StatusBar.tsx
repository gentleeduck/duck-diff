import { Button } from '@duck-diff/ui'
import { LoaderCircle, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSession } from '../hooks/useSession'
import { CommandLine } from '../keys/CommandLine'
import type { KeyState } from '../keys/state'
import { showKeys } from '../keys/which'
import { useStore } from '../lib/store'
import type { LiveState } from '../live/useLiveRefresh'
import type { JobsState } from '../panel/jobs'
import { relativeTime } from '../sidebar/relative-time'
import type { SessionState } from '../state/session'
import { useApp } from './AppProvider'

const STATUS = {
  open: { label: 'Live', color: 'var(--diff-added)' },
  connecting: { label: 'Connecting', color: 'var(--muted-foreground)' },
  closed: { label: 'Reconnecting', color: 'var(--warning)' },
}

const selectRunning = (state: JobsState) => state.running
const selectMode = (state: KeyState) =>
  state.commandLine ? 'command' : state.visual && state.mode === 'normal' ? 'visual' : state.mode
const selectPending = (state: KeyState) => state.pending.join(' ')
// lualine's tokyonight colors for each mode.
const MODES = {
  normal: { label: 'NORMAL', color: 'var(--tn-blue)' },
  insert: { label: 'INSERT', color: 'var(--tn-green)' },
  visual: { label: 'VISUAL', color: 'var(--tn-magenta)' },
  command: { label: 'COMMAND', color: 'var(--tn-yellow)' },
  terminal: { label: 'TERMINAL', color: 'var(--tn-teal)' },
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
  const { jobs, panel, keys } = useApp()
  const running = useStore(jobs, selectRunning)
  const modeName = useStore(keys, selectMode)
  const mode = MODES[modeName]
  const pending = useStore(keys, selectPending)

  const badge = (
    <span
      title="Key mode"
      className="-ms-4 flex h-full shrink-0 items-center px-3 text-background"
      style={{ background: mode.color }}>
      {mode.label}
    </span>
  )
  // As in Neovim, the command line takes the whole line while it is open.
  if (modeName === 'command') {
    return (
      <>
        {badge}
        <CommandLine />
      </>
    )
  }
  return (
    <>
      {badge}
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
      {pending ? <span className="text-foreground">{showKeys(pending.split(' '))}</span> : null}
      <span className="ml-auto" aria-live="polite">
        {status === 'loading' && 'Loading changes'}
        {status === 'error' && <span className="text-removed">Could not load changes: {error}</span>}
        {status === 'ready' && `Updated ${relativeTime(Number(loadedAt) / 1000)}`}
      </span>
    </>
  )
}
