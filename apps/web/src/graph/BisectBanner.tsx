import type { BisectState } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import { Bug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { ask } from '../app/Ask'
import { useGit } from '../git/GitProvider'

function progress(state: BisectState): string {
  if (!state.bad) return 'Bisecting. Mark a commit that has the problem as bad.'
  if (!state.good) return 'Bisecting. Now mark a commit from before the problem as good.'
  const left = state.remaining ?? 0
  return `Bisecting: ${left} ${left === 1 ? 'commit' : 'commits'} left. Try the checked out commit, then mark it.`
}

// While git bisects, say how far it has narrowed things down and mark the commit it checked out.
export function BisectBanner() {
  const { api, graphSelection } = useApp()
  const { status, busy, run } = useGit()
  const [state, setState] = useState<BisectState | null>(null)
  // The sync status refreshes after every change, which is when bisect state can move too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status is the trigger
  useEffect(() => {
    let alive = true
    api.bisect().then(
      (next) => alive && setState(next),
      () => alive && setState(null),
    )
    return () => {
      alive = false
    }
  }, [api, status])
  if (!state?.active) return null
  const runCommand = async () => {
    const values = await ask.prompt({
      title: 'Bisect with a command',
      fields: [
        { name: 'command', label: 'Exit 0 for good, 125 to skip, anything else for bad', placeholder: 'bun test' },
      ],
      action: 'Run',
    })
    if (values?.command) await run('bisect-run', { command: values.command }, 'Bisect run finished')
  }
  return (
    <div
      role="status"
      aria-label="Bisect"
      className="flex flex-wrap items-center gap-2 border-border border-b bg-tn-magenta/10 px-3 py-2">
      <Bug className="size-4 shrink-0 text-tn-magenta" />
      {state.culprit ? (
        <>
          <p className="min-w-0 flex-1 truncate">
            First bad commit: <code className="text-tn-yellow">{state.culprit.sha.slice(0, 7)}</code>{' '}
            {state.culprit.subject}
          </p>
          <Button size="sm" variant="outline" onClick={() => graphSelection.set(state.culprit?.sha ?? null)}>
            Show it
          </Button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1">{progress(state)}</p>
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'bisect-mark'}
            onClick={() => void run('bisect-mark', { kind: 'good' }, 'Marked good')}>
            Good
          </Button>
          <Button size="sm" variant="outline" onClick={() => void run('bisect-mark', { kind: 'bad' }, 'Marked bad')}>
            Bad
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void run('bisect-mark', { kind: 'skip' }, 'Skipped')}>
            Skip
          </Button>
          <Button size="sm" variant="ghost" loading={busy === 'bisect-run'} onClick={() => void runCommand()}>
            Run a command...
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={busy === 'bisect-reset'}
        onClick={() => void run('bisect-reset', undefined, 'Stopped bisecting')}>
        Stop bisecting
      </Button>
    </div>
  )
}
