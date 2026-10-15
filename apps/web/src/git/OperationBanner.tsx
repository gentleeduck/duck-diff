import type { SyncStatus } from '@duck-diff/protocol'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { TriangleAlert } from 'lucide-react'
import { useGit } from './GitProvider'

const NAMES: Record<NonNullable<SyncStatus['operation']>, string> = {
  merge: 'A merge',
  'cherry-pick': 'A cherry-pick',
  revert: 'A revert',
  rebase: 'A rebase',
}

// While git waits on an unfinished operation, say so where the user will commit or abort it.
export function OperationBanner() {
  const { status, busy, run } = useGit()
  const operation = status?.operation
  if (!operation) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        {NAMES[operation]} is in progress.{' '}
        {operation === 'rebase'
          ? 'Resolve the conflicts, stage them, then continue.'
          : 'Resolve the conflicts, stage them, then commit.'}
      </p>
      {operation === 'rebase' ? (
        <Button size="sm" loading={busy === 'continue'} onClick={() => void run('continue', undefined, 'Continued')}>
          Continue
        </Button>
      ) : null}
      {operation !== 'merge' ? (
        <Button
          size="sm"
          variant="outline"
          title="Leave this commit out and go on"
          loading={busy === 'skip'}
          onClick={() => void run('skip', undefined, 'Skipped that commit')}>
          Skip
        </Button>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" loading={busy === 'abort'}>
            Abort
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-72 flex-col gap-2">
          <p>Abort and put the branch back as it was? Resolutions made so far are lost.</p>
          <Button
            size="sm"
            variant="destructive"
            className="self-end"
            onClick={() => void run('abort', undefined, `Aborted the ${operation}`)}>
            Abort {operation}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
