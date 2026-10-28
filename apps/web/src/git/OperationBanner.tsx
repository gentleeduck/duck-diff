import type { SyncStatus } from '@duck-diff/protocol'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@duck-diff/ui'
import { GitMerge, TriangleAlert } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useView } from '../hooks/useView'
import { openMerge } from '../merge/open-merge'
import { type StageState, useStage } from '../state/stage'
import { useGit } from './GitProvider'

const NAMES: Record<NonNullable<SyncStatus['operation']>, string> = {
  merge: 'A merge',
  'cherry-pick': 'A cherry-pick',
  revert: 'A revert',
  rebase: 'A rebase',
}

export const countConflicts = (state: StageState) =>
  state.unstaged.filter((file) => file.status === 'conflicted').length

// Continue, skip and abort for the operation git is waiting on; with resolve, a way to the conflicts first.
export function OperationActions({ resolve }: { resolve: boolean }) {
  const { status, busy, run } = useGit()
  const app = useApp()
  const { show } = useView()
  const conflicts = countConflicts(useStage())
  const operation = status?.operation
  if (!operation) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {resolve && conflicts ? (
        <Button size="sm" variant="outline" onClick={() => openMerge(app, show, null)}>
          <GitMerge />
          Resolve {conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'}
        </Button>
      ) : null}
      <Button
        size="sm"
        disabled={conflicts > 0}
        title={conflicts ? 'Resolve every conflict first' : undefined}
        loading={busy === 'continue'}
        onClick={() => void run('continue', undefined, 'Continued')}>
        Continue
      </Button>
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

// While git waits on an unfinished operation, say so where the user will commit or abort it.
export function OperationBanner() {
  const { status } = useGit()
  const operation = status?.operation
  if (!operation) return null
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2">
      {/* The actions get a row of their own on top, so a narrow side panel never squeezes the words into a column. */}
      <OperationActions resolve />
      <p className="flex gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className="min-w-0">{NAMES[operation]} is in progress. Resolve the conflicts, then continue.</span>
      </p>
    </div>
  )
}
