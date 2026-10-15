import { Input } from '@duck-diff/ui'
import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { TreeSkeleton } from '../app/skeletons'
import { useCanOpen } from '../hooks/useCanOpen'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useTarget } from '../hooks/useTarget'
import { compileHidden } from '../lib/hide'
import { useStore } from '../lib/store'
import type { SessionState } from '../state/session'
import type { Settings } from '../state/settings'
import { actionsFor } from '../viewer/actions'
import { useWrites } from '../writes/WritesProvider'
import { FileTree } from './FileTree'
import { filterFiles, type TreeStatus } from './filters'
import { HiddenNotice } from './HiddenNotice'
import { HideFilter } from './HideFilter'
import { StatusFilter } from './StatusFilter'
import { FileMenu, FolderMenu } from './tree-menus'
import { ViewedProgress } from './ViewedProgress'

const selectFiles = (state: SessionState) => state.files
const selectLoading = (state: SessionState) => state.status === 'loading' && state.files.length === 0
const selectPatterns = (state: Settings) => state.hidePatterns
const selectFolders = (folders: ReadonlySet<string>) => folders
const selectTop = (path: string | null) => path

export function ChangesTree() {
  const { api, fileHistory, viewed, changesFolders, diffFile, diffTop } = useApp()
  const folders = useStore(changesFolders, selectFolders)
  const { target } = useTarget()
  const kinds = useMemo(() => actionsFor(target), [target])
  const writes = useWrites()
  const canOpen = useCanOpen()
  const files = useSession(selectFiles)
  const loading = useSession(selectLoading)
  const [statuses, setStatuses] = useState<ReadonlySet<TreeStatus>>(new Set())
  const [query, setQuery] = useState('')
  // The tree follows the diff: whatever file is at the top of it is the one marked here.
  const selected = useStore(diffTop, selectTop)
  const patterns = useSettings(selectPatterns)
  const hidden = useMemo(() => compileHidden(patterns), [patterns])
  // Folders whose files are all hidden drop out with them, since the tree is built from these paths.
  const shown = useMemo(() => files.filter((file) => !hidden(file.path)), [files, hidden])
  const visible = useMemo(() => filterFiles(shown, statuses, query), [shown, statuses, query])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  const paths = useMemo(() => visible.map((file) => file.path), [visible])
  const fileFor = useCallback((path: string) => byPath.get(path), [byPath])
  const open = (path: string) => diffFile.set(path)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="@container/side flex flex-col gap-2 border-border border-b p-3">
        <div className="flex items-center gap-2">
          <Input
            id="file-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files"
            aria-label="Filter files"
            className="h-7 min-w-0 flex-1"
          />
          <HideFilter hiddenCount={files.length - shown.length} />
        </div>
        <StatusFilter files={shown} value={statuses} onChange={setStatuses} />
        <ViewedProgress files={shown} target={target} />
      </div>
      {loading ? <TreeSkeleton /> : null}
      {visible.length > 0 ? (
        <FileTree
          label="Changed files"
          paths={paths}
          fileFor={fileFor}
          selected={selected}
          onOpenFile={open}
          toggled={folders}
          onToggled={(next) => changesFolders.set(next)}
          menuFor={(row) => {
            if (row.kind === 'directory') {
              const inside = files.filter(
                (file) => file.path.startsWith(`${row.path}/`) && file.status !== 'conflicted',
              )
              return (
                <FolderMenu
                  path={row.path}
                  writes={kinds}
                  onWrite={(kind) => void writes.performAll(kind, inside, `${inside.length} files in ${row.path}`)}
                />
              )
            }
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
      ) : files.length > 0 && shown.length === 0 ? (
        <HiddenNotice count={files.length} />
      ) : loading ? null : (
        <p className="p-3 text-tn-comment">
          {files.length === 0
            ? 'No changes in this comparison. Nothing to see, waddle along.'
            : 'No files match the filter.'}
        </p>
      )}
    </div>
  )
}
