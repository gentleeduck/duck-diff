import { Badge } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { GitMerge } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { OperationActions } from '../git/OperationBanner'
import { useStore } from '../lib/store'
import { useStage } from '../state/stage'
import { headline, selectConflicts } from './merge-model'

const selectPath = (path: string | null) => path

// The merge page's top bar: what is being merged, how much is left, and the way out either side.
export function MergeHeader() {
  const { mergeFile, queries, toolId } = useApp()
  const { status } = useGit()
  const paths = selectConflicts(useStage()).split('\n').filter(Boolean)
  const path = useStore(mergeFile, selectPath) ?? paths[0] ?? null
  // The open file's markers name the other side; the editor reads the same cached answer.
  const file = useQuery({ ...queries.git.conflict(path ?? ''), enabled: Boolean(path) }).data
  const first = file?.segments.find((segment) => segment.kind === 'conflict')
  const theirs = status?.incoming ?? (first?.kind === 'conflict' ? first.theirsLabel : null)
  const operation = status?.operation ?? null
  return (
    <>
      <h1 className="flex min-w-0 flex-1 items-center gap-2">
        <GitMerge className="size-4 shrink-0 text-tn-magenta" />
        <span className="truncate">{headline(operation, status?.branch ?? null, theirs)}</span>
        {operation ? (
          <Badge variant={paths.length ? 'soft-warning' : 'soft-success'} size="sm" className="shrink-0">
            {paths.length ? `${paths.length} ${paths.length === 1 ? 'file' : 'files'} left` : 'All resolved'}
          </Badge>
        ) : null}
      </h1>
      {/* Once nothing is left, the page itself offers Continue and Abort. */}
      {/* In a window git opened as its merge tool, git and the terminal finish the operation. */}
      {paths.length && !toolId ? <OperationActions resolve={false} /> : null}
    </>
  )
}
