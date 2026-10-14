import { Input } from '@duck-diff/ui'
import { FileTree, useFileTree } from '@pierre/trees/react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { itemId } from '../lib/items'
import type { SessionState } from '../state/session'
import { filterFiles, type TreeStatus, toGitStatus } from './filters'
import { StatusFilter } from './StatusFilter'

const selectFiles = (state: SessionState) => state.files

// The tree lives in a shadow root, so its colors come in through its override variables.
const TREE_STYLE = {
  height: '100%',
  '--trees-bg-override': 'var(--sidebar)',
  '--trees-bg-muted-override': 'var(--sidebar-accent)',
  '--trees-fg-override': 'var(--sidebar-foreground)',
  '--trees-fg-muted-override': 'var(--muted-foreground)',
  '--trees-accent-override': 'var(--sidebar-primary)',
  '--trees-focus-ring-color-override': 'var(--sidebar-ring)',
  '--trees-border-color-override': 'var(--sidebar-border)',
  '--trees-font-family-override': 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
  '--trees-font-size-override': '13px',
  '--trees-border-radius-override': 'calc(var(--radius) - 2px)',
  '--trees-selected-bg-override': 'var(--sidebar-accent)',
  '--trees-selected-fg-override': 'var(--sidebar-accent-foreground)',
  // Names stay in the text color; only the status letter carries meaning in color.
  '--trees-git-added-color-override': 'var(--sidebar-foreground)',
  '--trees-git-modified-color-override': 'var(--sidebar-foreground)',
  '--trees-git-renamed-color-override': 'var(--sidebar-foreground)',
  '--trees-git-untracked-color-override': 'var(--sidebar-foreground)',
  '--trees-git-deleted-color-override': 'var(--muted-foreground)',
  '--trees-status-added-override': 'var(--diff-added)',
  '--trees-status-untracked-override': 'var(--diff-added)',
  '--trees-status-deleted-override': 'var(--diff-removed)',
  '--trees-status-modified-override': 'var(--warning)',
  '--trees-status-renamed-override': 'var(--muted-foreground)',
} as React.CSSProperties

export function ChangesTree() {
  const { viewer } = useApp()
  const files = useSession(selectFiles)
  const [statuses, setStatuses] = useState<ReadonlySet<TreeStatus>>(new Set())
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterFiles(files, statuses, query), [files, statuses, query])

  const { model } = useFileTree({
    paths: [],
    initialExpansion: 'open',
    flattenEmptyDirectories: true,
    density: 'compact',
    onSelectionChange: (paths) => {
      const path = paths[0]
      if (path) viewer.current?.scrollTo({ type: 'item', id: itemId(path), align: 'start' })
    },
  })

  useEffect(() => {
    model.resetPaths(visible.map((file) => file.path))
    model.setGitStatus(visible.map((file) => ({ path: file.path, status: toGitStatus(file.status) })))
  }, [model, visible])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-border border-b p-3">
        <Input
          id="file-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          className="h-8"
        />
        <StatusFilter files={files} value={statuses} onChange={setStatuses} />
      </div>
      <div className="min-h-0 flex-1">
        {visible.length > 0 ? (
          <FileTree model={model} style={TREE_STYLE} />
        ) : (
          <p className="p-3 text-[13px] text-muted-foreground">
            {files.length === 0 ? 'No changes in this comparison.' : 'No files match the filter.'}
          </p>
        )}
      </div>
    </div>
  )
}
