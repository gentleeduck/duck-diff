import type { ChangedFile } from '@duck-diff/protocol'
import { Button, ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@duck-diff/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRowHeight } from '../app/useSizes'
import { CHEVRON, FOLDER, fileGlyph, isSpecialFile, STATUS_LETTER } from './icons'
import { buildTree, type TreeRow as Row, visibleRows } from './tree-model'

export type { Row as TreeRow }

const ROW = 28

// Extra props come from a context-menu trigger wrapping the row.
function TreeItem({
  row,
  file,
  selected,
  onClick,
  ...rest
}: { row: Row; file: ChangedFile | undefined; selected: boolean; onClick(): void } & Omit<
  ComponentProps<typeof Button>,
  'onClick'
>) {
  const folder = row.kind === 'directory'
  const icon = folder ? { glyph: row.expanded ? FOLDER.open : FOLDER.closed, color: FOLDER.color } : fileGlyph(row.name)
  const status = file ? STATUS_LETTER[file.status] : null
  const special = !folder && isSpecialFile(row.name)
  return (
    <Button
      {...rest}
      size="sm"
      variant="ghost"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      onClick={onClick}
      aria-expanded={folder ? row.expanded : undefined}
      aria-current={selected || undefined}
      title={status ? `${row.path} (${status.title})` : row.path}
      className="h-7 w-full items-stretch justify-start gap-0 rounded-none p-0 ps-1 pe-2 text-start font-bold aria-[current=true]:bg-accent [&>span]:flex [&>span]:items-center">
      {row.ancestors.map((ancestor) => (
        // One guide per ancestor, drawn through the middle of that folder's chevron, like the editor's tree.
        <span
          key={ancestor}
          className="relative w-4 shrink-0 self-stretch before:absolute before:inset-y-0 before:start-[7px] before:w-px before:bg-tn-gutter"
        />
      ))}
      <span className="w-4 shrink-0 justify-center text-tn-comment">
        {folder ? (row.expanded ? CHEVRON.open : CHEVRON.closed) : ''}
      </span>
      <span className="w-5 shrink-0 justify-center" style={{ color: icon.color }}>
        {icon.glyph}
      </span>
      <span
        className={`ms-1 min-w-0 flex-1 truncate ${folder ? 'text-tn-blue' : special ? 'text-tn-pink underline' : 'text-foreground'} ${file?.status === 'deleted' ? 'line-through' : ''}`}
        style={status && !folder ? { color: status.color } : undefined}>
        {row.name}
      </span>
      {status ? (
        <span className="w-4 shrink-0 justify-end ps-1" style={{ color: status.color }}>
          {status.letter}
        </span>
      ) : null}
    </Button>
  )
}

function WithMenu({ items, children }: { items: ReactNode; children: ReactElement }) {
  if (!items) return children
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>{items}</ContextMenuContent>
    </ContextMenu>
  )
}

interface FileTreeProps {
  label: string
  paths: readonly string[]
  // Git state per path, when the file is changed in the current comparison.
  fileFor(path: string): ChangedFile | undefined
  selected: string | null
  onOpenFile(path: string): void
  // Folders start closed, as in a whole-repo tree; a changes tree opens everything.
  collapsed?: boolean
  // Right-click menu items for a row, or nothing for no menu.
  menuFor?(row: Row): ReactNode
  // Folders flipped from their starting state, when the caller keeps them (to fold the diff along).
  toggled?: ReadonlySet<string>
  onToggled?(next: ReadonlySet<string>): void
}

export function FileTree({
  label,
  paths,
  fileFor,
  selected,
  onOpenFile,
  collapsed = false,
  menuFor,
  toggled: controlled,
  onToggled,
}: FileTreeProps) {
  const [own, setOwn] = useState<ReadonlySet<string>>(new Set())
  const toggled = controlled ?? own
  const setToggled = useCallback(
    (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) => {
      const next = update(toggled)
      if (next === toggled) return
      if (onToggled) onToggled(next)
      else setOwn(next)
    },
    [toggled, onToggled],
  )
  const tree = useMemo(() => buildTree(paths), [paths])
  const rows = useMemo(() => visibleRows(tree, toggled, !collapsed), [tree, toggled, collapsed])

  // A file picked elsewhere (the palette, the README on load) gets its folders opened so it shows.
  useEffect(() => {
    if (!collapsed || !selected) return
    const parts = selected.split('/').slice(0, -1)
    const folders = parts.map((_, i) => parts.slice(0, i + 1).join('/'))
    setToggled((prev) => (folders.every((folder) => prev.has(folder)) ? prev : new Set([...prev, ...folders])))
  }, [collapsed, selected, setToggled])
  const scroller = useRef<HTMLDivElement>(null)
  const ROW_HEIGHT = useRowHeight(ROW)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })
  // The selected file stays in sight: picked in search, opened by link, or reached by scrolling the diff.
  const shownIndex = selected ? rows.findIndex((row) => row.path === selected) : -1
  useEffect(() => {
    if (shownIndex >= 0) virtualizer.scrollToIndex(shownIndex, { align: 'auto' })
  }, [shownIndex, virtualizer])
  // A new interface size changes every row's height at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height is the trigger
  useEffect(() => virtualizer.measure(), [virtualizer, ROW_HEIGHT])

  const open = (row: Row) => {
    if (row.kind === 'file') return onOpenFile(row.path)
    setToggled((prev) => {
      const next = new Set(prev)
      if (!next.delete(row.path)) next.add(row.path)
      return next
    })
  }

  return (
    <div ref={scroller} role="tree" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-1">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const row = rows[virtual.index]
          if (!row) return null
          return (
            <div key={row.path} className="absolute inset-x-0" style={{ transform: `translateY(${virtual.start}px)` }}>
              <WithMenu items={menuFor?.(row)}>
                <TreeItem
                  row={row}
                  file={fileFor(row.path)}
                  selected={row.path === selected}
                  onClick={() => open(row)}
                />
              </WithMenu>
            </div>
          )
        })}
      </div>
    </div>
  )
}
