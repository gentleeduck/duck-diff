import { Input } from '@duck-diff/ui'
import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useCanOpen } from '../hooks/useCanOpen'
import { useSession } from '../hooks/useSession'
import { useTarget } from '../hooks/useTarget'
import { itemId } from '../lib/items'
import type { SessionState } from '../state/session'
import { actionsFor } from '../viewer/actions'
import { useWrites } from '../writes/WritesProvider'
import { FileTree } from './FileTree'
import { filterFiles, type TreeStatus } from './filters'
import { StatusFilter } from './StatusFilter'
import { CopyItems, FileMenu } from './tree-menus'

const selectFiles = (state: SessionState) => state.files

export function ChangesTree() {
  const { api, viewer, fileHistory, viewed } = useApp()
  const { target } = useTarget()
  const kinds = useMemo(() => actionsFor(target), [target])
  const writes = useWrites()
  const canOpen = useCanOpen()
  const files = useSession(selectFiles)
  const [statuses, setStatuses] = useState<ReadonlySet<TreeStatus>>(new Set())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const visible = useMemo(() => filterFiles(files, statuses, query), [files, statuses, query])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  const paths = useMemo(() => visible.map((file) => file.path), [visible])
  const fileFor = useCallback((path: string) => byPath.get(path), [byPath])
  const open = (path: string) => {
    setSelected(path)
    viewer.current?.scrollTo({ type: 'item', id: itemId(path), align: 'start' })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-border border-b p-3">
        <Input
          id="file-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          aria-label="Filter files"
        />
        <StatusFilter files={files} value={statuses} onChange={setStatuses} />
      </div>
      {visible.length > 0 ? (
        <FileTree
          label="Changed files"
          paths={paths}
          fileFor={fileFor}
          selected={selected}
          onOpenFile={open}
          menuFor={(row) => {
            if (row.kind === 'directory') return <CopyItems path={row.path} />
            const file = byPath.get(row.path)
            return (
              <FileMenu
                path={row.path}
                openLabel="Go to file"
                onOpen={() => open(row.path)}
                onHistory={() => fileHistory.set(row.path)}
                onNeovim={canOpen ? () => void api.open(row.path, 1) : undefined}
                onViewed={file ? () => viewed.toggle(target, file) : undefined}
                writes={file && file.status !== 'conflicted' ? kinds : []}
                onWrite={(kind) => file && void writes.perform(kind, file)}
              />
            )
          }}
        />
      ) : (
        <p className="p-3 text-tn-comment">
          {files.length === 0 ? 'No changes in this comparison.' : 'No files match the filter.'}
        </p>
      )}
    </div>
  )
}
