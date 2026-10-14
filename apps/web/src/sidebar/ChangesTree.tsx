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
  '--trees-bg-override': 'var(--dd-surface)',
  '--trees-bg-muted-override': 'var(--dd-base)',
  '--trees-fg-override': 'var(--dd-text)',
  '--trees-fg-muted-override': 'var(--dd-muted)',
  '--trees-accent-override': 'var(--dd-accent)',
  '--trees-focus-ring-color-override': 'var(--dd-accent)',
  '--trees-border-color-override': 'var(--dd-line)',
  '--trees-font-family-override': 'var(--dd-font-ui)',
  '--trees-font-size-override': '13px',
  '--trees-selected-bg-override': 'color-mix(in oklab, var(--dd-accent) 22%, transparent)',
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-[var(--dd-line)] border-b p-3">
        <input
          id="file-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
          className="h-7 rounded-md border border-[var(--dd-line)] bg-[var(--dd-base)] px-2 text-[13px] placeholder:text-[var(--dd-muted)]"
        />
        <StatusFilter files={files} value={statuses} onChange={setStatuses} />
      </div>
      <div className="min-h-0 flex-1">
        {visible.length > 0 ? (
          <FileTree model={model} style={TREE_STYLE} />
        ) : (
          <p className="p-3 text-[13px] text-[var(--dd-muted)]">
            {files.length === 0 ? 'No changes in this comparison.' : 'No files match the filter.'}
          </p>
        )}
      </div>
    </div>
  )
}
