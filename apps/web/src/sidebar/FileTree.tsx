import type { ChangedFile } from '@duck-diff/protocol'
import { Button } from '@duck-diff/ui'
import type { FileTreeVisibleRow } from '@pierre/trees'
import { useFileTree } from '@pierre/trees/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useReducer, useRef } from 'react'
import { CHEVRON, FOLDER, fileGlyph, isSpecialFile, STATUS_GLYPH } from './icons'

const ROW_HEIGHT = 28

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
      size="sm"
      variant="ghost"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      onClick={onClick}
      aria-expanded={folder ? row.isExpanded : undefined}
      aria-current={selected || undefined}
      title={row.path}
      className="h-7 w-full items-stretch justify-start gap-0 rounded-none p-0 pe-3 text-start font-bold aria-[current=true]:bg-accent [&>span]:flex [&>span]:items-center">
      {(row.depth > 0 ? row.ancestorPaths.slice(-row.depth) : []).map((ancestor) => (
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

interface FileTreeProps {
  label: string
  paths: readonly string[]
  // Git state per path, when the file is changed in the current comparison.
  fileFor(path: string): ChangedFile | undefined
  selected: string | null
  onOpenFile(path: string): void
}

// @pierre/trees keeps the structure, expansion and flattening; the rows are ours, drawn like the editor's tree.
export function FileTree({ label, paths, fileFor, selected, onOpenFile }: FileTreeProps) {
  const { model } = useFileTree({ paths: [], initialExpansion: 'open', flattenEmptyDirectories: true })
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => model.subscribe(refresh), [model])
  useEffect(() => model.resetPaths([...paths]), [model, paths])

  const rows = model.getVisibleRows(0, model.getVisibleCount())
  const scroller = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const open = (row: FileTreeVisibleRow) => {
    if (row.kind === 'directory') {
      const handle = model.getItem(row.path)
      if (handle && 'toggle' in handle) handle.toggle()
      return
    }
    onOpenFile(row.path)
  }

  return (
    <div ref={scroller} role="tree" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-1">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const row = rows[virtual.index]
          if (!row) return null
          return (
            <div key={row.path} className="absolute inset-x-0" style={{ transform: `translateY(${virtual.start}px)` }}>
              <TreeRow row={row} file={fileFor(row.path)} selected={row.path === selected} onClick={() => open(row)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
