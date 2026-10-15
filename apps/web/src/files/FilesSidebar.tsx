import { Input } from '@duck-diff/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useCanOpen } from '../hooks/useCanOpen'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { useView } from '../hooks/useView'
import { useStore } from '../lib/store'
import { FileTree } from '../sidebar/FileTree'
import { CopyItems, FileMenu } from '../sidebar/tree-menus'
import type { SessionState } from '../state/session'

const selectFiles = (state: SessionState) => state.files
const selectPath = (path: string | null) => path

export function FilesSidebar() {
  const { api, fileSelection, fileHistory } = useApp()
  const { navigate } = useTarget()
  const { show } = useView()
  const canOpen = useCanOpen()
  const changed = useSession(selectFiles)
  const selected = useStore(fileSelection, selectPath)
  const [paths, setPaths] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    api.tree().then(
      (list) => {
        if (!alive) return
        setPaths(list)
        // Like a repo's home page on GitHub, the README is what opens first.
        const readme = list.find((path) => /^readme(\.md|\.txt)?$/i.test(path))
        if (readme && fileSelection.get() === null) fileSelection.set(readme)
      },
      () => alive && setPaths([]),
    )
    return () => {
      alive = false
    }
  }, [api, fileSelection])

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
      {paths === null ? null : shown.length > 0 ? (
        <FileTree
          label="All files"
          paths={shown}
          fileFor={fileFor}
          selected={selected}
          onOpenFile={(path) => fileSelection.set(path)}
          menuFor={(row) =>
            row.kind === 'directory' ? (
              <CopyItems path={row.path} />
            ) : (
              <FileMenu
                path={row.path}
                onOpen={() => fileSelection.set(row.path)}
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
                onNeovim={canOpen ? () => void api.open(row.path, 1) : undefined}
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
