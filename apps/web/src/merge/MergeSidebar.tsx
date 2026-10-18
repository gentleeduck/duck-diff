import { Badge, Button } from '@duck-diff/ui'
import { useQueries } from '@tanstack/react-query'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import { useStage } from '../state/stage'
import { selectConflicts } from './merge-model'

const selectPath = (path: string | null) => path

export function MergeSidebar() {
  const { mergeFile, mergeTop, queries } = useApp()
  const conflicts = selectConflicts(useStage())
  const onScreen = useStore(mergeTop, selectPath)
  const picked = useStore(mergeFile, selectPath)
  const current = onScreen ?? picked
  const paths = conflicts ? conflicts.split('\n') : []
  // How many blocks each file holds, from the same reads the editor opens them with.
  const counts = useQueries({ queries: paths.map((path) => queries.git.conflict(path)) }).map(
    (read) => read.data?.segments.filter((segment) => segment.kind === 'conflict').length ?? null,
  )
  if (!paths.length) return <p className="p-3 text-muted-foreground">No conflicted files. Peace in the pond.</p>
  const active = current ?? paths[0]
  return (
    <ul aria-label="Conflicted files" className="flex flex-col p-2">
      {paths.map((path, index) => {
        const icon = fileGlyph(path.split('/').pop() ?? path)
        const count = counts[index] ?? null
        return (
          <li key={path}>
            <Button
              variant="nothing"
              size="none"
              type="button"
              aria-current={path === active}
              title={path}
              onClick={() => {
                mergeFile.set(path)
                // Every file is on the page, so picking one scrolls to it, again if it is picked twice.
                document
                  .querySelector(`[data-merge-file="${CSS.escape(path)}"]`)
                  ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-start hover:bg-accent/60 aria-[current=true]:bg-accent justify-start">
              <span className="text-removed">!</span>
              <span style={{ color: icon.color }}>{icon.glyph}</span>
              <span className="min-w-0 flex-1 truncate">{path}</span>
              {count ? (
                <Badge
                  variant="soft-warning"
                  size="sm"
                  className="shrink-0 tabular-nums"
                  title="Conflicts in this file">
                  {count}
                </Badge>
              ) : null}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
