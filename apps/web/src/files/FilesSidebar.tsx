import { Input } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { useApp } from '../app/AppProvider'
import { TreeSkeleton } from '../app/skeletons'
import { useOpenFile } from '../hooks/useOpenFile'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { withoutHistory } from '../lib/history'
import { useKept } from '../lib/kept'
import { useStore } from '../lib/store'
import { FileTree } from '../sidebar/FileTree'
import { CopyItems, FileMenu } from '../sidebar/tree-menus'
import type { SessionState } from '../state/session'
import { openFile } from './open-file'

const selectFiles = (state: SessionState) => state.files
const selectPath = (path: string | null) => path
const NO_PATHS: string[] = []

export function FilesSidebar() {
  const app = useApp()
  const { fileSelection, fileHistory, queries } = app
  const { navigate } = useTarget()
  const { show } = useView()
  const openInEditor = useOpenFile()
  const changed = useSession(selectFiles)
  const selected = useStore(fileSelection, selectPath)
  const tree = useQuery(queries.git.tree())
  const paths = tree.data ?? (tree.isError ? NO_PATHS : null)
  const [query, setQuery] = useKept('files-query', '')

  // Like a repo's home page on GitHub, the README is what opens first.
  useEffect(() => {
    const readme = tree.data?.find((path) => /^readme(\.md|\.txt)?$/i.test(path))
    if (readme && fileSelection.get() === null) withoutHistory(() => fileSelection.set(readme))
  }, [tree.data, fileSelection])

  const byPath = useMemo(() => new Map(changed.map((file) => [file.path, file])), [changed])
  const fileFor = useCallback((path: string) => byPath.get(path), [byPath])
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? (paths ?? []).filter((path) => path.toLowerCase().includes(needle)) : (paths ?? [])
  }, [paths, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border border-b p-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter all files"
        />
      </div>
      {paths === null ? (
        <TreeSkeleton />
      ) : shown.length > 0 ? (
        <FileTree
          keep="files"
          label="All files"
          paths={shown}
          fileFor={fileFor}
          selected={selected}
          onOpenFile={(path) => openFile(app, path)}
          menuFor={(row) =>
            row.kind === 'directory' ? (
              <CopyItems path={row.path} />
            ) : (
              <FileMenu
                path={row.path}
                onOpen={() => openFile(app, row.path)}
                onChanges={
                  byPath.has(row.path)
                    ? () => {
                        navigate({ kind: 'local' })
                        show('changes')
                      }
                    : undefined
                }
                onHistory={() => {
                  fileHistory.set(row.path)
                  show('changes')
                }}
                onEditor={() => void openInEditor(row.path)}
              />
            )
          }
          // A filter shows its matches with their folders open.
          collapsed={!query.trim()}
        />
      ) : (
        <p className="p-3 text-tn-comment">
          {paths.length === 0 ? 'This repository has no files yet.' : 'No files match.'}
        </p>
      )}
    </div>
  )
}
