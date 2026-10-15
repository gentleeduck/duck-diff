import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import { useStage } from '../state/stage'
import { selectConflicts } from './merge-model'

const selectPath = (path: string | null) => path

export function MergeSidebar() {
  const { mergeFile } = useApp()
  const conflicts = selectConflicts(useStage())
  const current = useStore(mergeFile, selectPath)
  const paths = conflicts ? conflicts.split('\n') : []
  if (!paths.length) return <p className="p-3 text-muted-foreground">No conflicted files. Peace in the pond.</p>
  const active = current ?? paths[0]
  return (
    <ul aria-label="Conflicted files" className="flex flex-col p-2">
      {paths.map((path) => {
        const icon = fileGlyph(path.split('/').pop() ?? path)
        return (
          <li key={path}>
            <button
              type="button"
              aria-current={path === active}
              title={path}
              onClick={() => mergeFile.set(path)}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-start hover:bg-accent/60 aria-[current=true]:bg-accent">
              <span className="text-removed">!</span>
              <span style={{ color: icon.color }}>{icon.glyph}</span>
              <span className="min-w-0 truncate">{path}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
