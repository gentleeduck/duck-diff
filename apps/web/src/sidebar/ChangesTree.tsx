import type { ChangedFile } from '@duck-diff/protocol'
import { Button, Input } from '@duck-diff/ui'
import type { FileTreeVisibleRow } from '@pierre/trees'
import { useFileTree } from '@pierre/trees/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useSession } from '../hooks/useSession'
import { itemId } from '../lib/items'
import type { SessionState } from '../state/session'
import { filterFiles, type TreeStatus } from './filters'
import { CHEVRON, FOLDER, fileGlyph, isSpecialFile, STATUS_GLYPH } from './icons'
import { StatusFilter } from './StatusFilter'

const selectFiles = (state: SessionState) => state.files
const ROW_HEIGHT = 25

function TreeRow({
  row,
  file,
  selected,
  onClick,
}: {
  row: FileTreeVisibleRow
  file: ChangedFile | undefined
  selected: boolean
  onClick(): void
}) {
  const folder = row.kind === 'directory'
  const icon = folder
    ? { glyph: row.isExpanded ? FOLDER.open : FOLDER.closed, color: FOLDER.color }
    : fileGlyph(row.name)
  const status = file ? STATUS_GLYPH[file.status] : null
  const dim = file && (file.status === 'modified' || file.status === 'type-changed')
  const name = folder
    ? 'text-tn-blue'
    : isSpecialFile(row.name)
      ? 'text-tn-pink underline'
      : file?.status === 'deleted'
        ? 'text-tn-comment line-through'
        : dim
          ? 'text-tn-dark5'
          : 'text-tn-blue'
  return (
    <Button
      variant="ghost"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      onClick={onClick}
      aria-expanded={folder ? row.isExpanded : undefined}
      aria-current={selected || undefined}
      title={row.path}
      className="h-[25px] w-full items-stretch justify-start gap-0 rounded-none p-0 pe-3 text-start font-bold aria-[current=true]:bg-accent [&>span]:flex [&>span]:items-center">
      {row.ancestorPaths
        .slice(-row.depth || row.ancestorPaths.length)
        .slice(0, row.depth)
        .map((ancestor) => (
          // Indent guides, one per ancestor, like the editor's tree.
          <span key={ancestor} className="w-5 shrink-0 self-stretch border-tn-gutter border-s ms-[9px]" />
        ))}
      <span className="w-5 shrink-0 justify-center text-tn-comment">
        {folder ? (row.isExpanded ? CHEVRON.open : CHEVRON.closed) : ''}
      </span>
      <span className="w-6 shrink-0 justify-center" style={{ color: icon.color }}>
        {icon.glyph}
      </span>
      {status ? (
        <span className="w-6 shrink-0 justify-center" style={{ color: status.color }}>
          {status.glyph}
        </span>
      ) : null}
      <span className={`min-w-0 truncate ${name}`}>
        {row.flattenedSegments?.length ? row.flattenedSegments.map((segment) => segment.name).join('/') : row.name}
      </span>
    </Button>
  )
}

export function ChangesTree() {
  const { viewer } = useApp()
  const files = useSession(selectFiles)
  const [statuses, setStatuses] = useState<ReadonlySet<TreeStatus>>(new Set())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const visible = useMemo(() => filterFiles(files, statuses, query), [files, statuses, query])
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])

  // @pierre/trees keeps the structure, expansion and flattening; the rows below are ours.
  const { model } = useFileTree({ paths: [], initialExpansion: 'open', flattenEmptyDirectories: true })
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => model.subscribe(refresh), [model])
  useEffect(() => model.resetPaths(visible.map((file) => file.path)), [model, visible])

  const count = model.getVisibleCount()
  const rows = model.getVisibleRows(0, count)
  const scroller = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const open = (row: FileTreeVisibleRow) => {
    const handle = model.getItem(row.path)
    if (row.kind === 'directory') {
      if (handle && 'toggle' in handle) handle.toggle()
      return
    }
    setSelected(row.path)
    viewer.current?.scrollTo({ type: 'item', id: itemId(row.path), align: 'start' })
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
          className="h-8"
        />
        <StatusFilter files={files} value={statuses} onChange={setStatuses} />
      </div>
      {visible.length > 0 ? (
        <div ref={scroller} role="tree" aria-label="Changed files" className="min-h-0 flex-1 overflow-y-auto py-1">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => {
              const row = rows[virtual.index]
              if (!row) return null
              return (
                <div
                  key={row.path}
                  className="absolute inset-x-0"
                  style={{ transform: `translateY(${virtual.start}px)` }}>
                  <TreeRow
                    row={row}
                    file={byPath.get(row.path)}
                    selected={row.path === selected}
                    onClick={() => open(row)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="p-3 text-tn-comment">
          {files.length === 0 ? 'No changes in this comparison.' : 'No files match the filter.'}
        </p>
      )}
    </div>
  )
}
