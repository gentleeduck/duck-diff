import { Badge, Button } from '@duck-diff/ui'
import { useQueries } from '@tanstack/react-query'
import { GitMerge } from 'lucide-react'
import { useApp } from '../app/AppProvider'
import { useGit } from '../git/GitProvider'
import { OperationActions } from '../git/OperationBanner'
import { useView } from '../hooks/useView'
import { fileGlyph } from '../sidebar/icons'
import { useStage } from '../state/stage'
import { headline, selectConflicts } from './merge-model'
import { openMerge } from './open-merge'
import { ResolvedFiles } from './ResolvedFiles'

// The bottom panel's Merge tab, there while git waits on an operation: what is coming together, each conflicted
// file with a quick way through it, and Continue or Abort. A conflict met in a terminal shows up here at once.
export function MergePanel() {
  const app = useApp()
  const { queries } = app
  const { show } = useView()
  const { status, run, busy } = useGit()
  const conflicts = selectConflicts(useStage())
  const paths = conflicts ? conflicts.split('\n') : []
  const counts = useQueries({ queries: paths.map((path) => queries.git.conflict(path)) }).map(
    (read) => read.data?.segments.filter((segment) => segment.kind === 'conflict').length ?? null,
  )
  const operation = status?.operation ?? null
  return (
    <section aria-label="Merge in progress" className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-border border-b px-3 py-1">
        <GitMerge className="size-4 shrink-0 text-tn-magenta" />
        <span className="min-w-0 truncate">
          {headline(operation, status?.branch ?? null, status?.incoming ?? null)}
        </span>
        <Badge variant={paths.length ? 'soft-warning' : 'soft-success'} size="sm" className="shrink-0">
          {paths.length ? `${paths.length} ${paths.length === 1 ? 'file' : 'files'} to resolve` : 'All resolved'}
        </Badge>
        <span className="ms-auto">
          <OperationActions resolve={false} />
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {paths.length ? (
          <ul aria-label="Conflicted files" className="p-1">
            {paths.map((path, index) => {
              const icon = fileGlyph(path.split('/').pop() ?? path)
              const count = counts[index]
              return (
                <li key={path} className="group flex h-8 items-center gap-2 rounded-sm px-2 hover:bg-accent/40">
                  <span className="text-removed">!</span>
                  <span style={{ color: icon.color }}>{icon.glyph}</span>
                  <span className="min-w-0 flex-1 truncate" title={path}>
                    {path}
                  </span>
                  {count ? (
                    <Badge
                      variant="soft-warning"
                      size="sm"
                      className="shrink-0 tabular-nums"
                      title="Conflicts in this file">
                      {count}
                    </Badge>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Take current for ${path}`}
                    disabled={busy !== null}
                    onClick={() => void run('resolve', { path, side: 'ours' }, `Kept the current change in ${path}`)}>
                    Take current
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Take incoming for ${path}`}
                    disabled={busy !== null}
                    onClick={() =>
                      void run('resolve', { path, side: 'theirs' }, `Took the incoming change in ${path}`)
                    }>
                    Take incoming
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Resolve ${path}`}
                    onClick={() => openMerge(app, show, path)}>
                    Resolve
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="p-4 text-muted-foreground">
            {operation
              ? 'Every conflict is resolved. Continue makes the commit and finishes it.'
              : 'Nothing in progress.'}
          </p>
        )}
        <ResolvedFiles />
      </div>
    </section>
  )
}
