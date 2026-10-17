import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
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
import { CHEVRON, FOLDER, fileGlyph, fileLook, folderLook, STATUS_MARK, SUBMODULE } from './icons'
import { buildTree, type TreeRow as Row, visibleRows } from './tree-model'

export type { Row as TreeRow }

const ROW = 28
const SETTLE_MS = 800

type Mark = { glyph: string; color: string; title: string }

const LINE = 'before:absolute before:inset-y-0 before:start-[9px] before:w-px before:bg-tn-gutter'
const ELBOW =
  'before:absolute before:top-0 before:h-1/2 before:start-[9px] before:w-px before:bg-tn-gutter after:absolute after:top-1/2 after:start-[9px] after:end-0 after:h-px after:bg-tn-gutter'

// One row in nvim-tree's look: guides through each folder's chevron, ending in an elbow at a folder's
// last item; then chevron, icon, git marks and name. Extra props come from a context-menu trigger.
function TreeItem({
  row,
  file,
  marks,
  color,
  selected,
  onClick,
  ...rest
}: {
  row: Row
  file: ChangedFile | undefined
  marks: Mark[]
  // The folder's name color; a file's comes from its own status.
  color: string
  selected: boolean
  onClick(): void
} & Omit<ComponentProps<typeof Button>, 'onClick'>) {
  const folder = row.kind === 'directory'
  const icon = folder
    ? { glyph: row.expanded ? FOLDER.open : FOLDER.closed, color: FOLDER.color }
    : file?.submodule
      ? SUBMODULE
      : fileGlyph(row.name)
  const look = folder ? { color, underline: false } : fileLook(row.name, file?.status)
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
      title={marks.length ? `${row.path} (${marks.map((mark) => mark.title).join(', ')})` : row.path}
      className="h-7 w-full items-stretch justify-start gap-0 rounded-none p-0 ps-1 pe-3 text-start aria-[current=true]:bg-accent [&>span]:flex [&>span]:items-center">
      {row.ancestors.map((ancestor, column) => (
        // A folder's guide runs in the column under its icon, where its items' arrows sit; it is drawn
        // only while that folder still has items further down.
        <span
          key={ancestor}
          className={`relative w-5 shrink-0 self-stretch ${column > 0 && !row.ancestorsLast[column] ? LINE : ''}`}
        />
      ))}
      {folder ? (
        <span className="w-5 shrink-0 justify-center text-tn-gutter">
          {row.expanded ? CHEVRON.open : CHEVRON.closed}
        </span>
      ) : (
        // A file stands on its folder's guide: a straight piece, or the elbow when it is the last item.
        <span className={`relative w-5 shrink-0 self-stretch ${row.depth === 0 ? '' : row.last ? ELBOW : LINE}`} />
      )}
      <span className="w-5 shrink-0 justify-center" style={{ color: icon.color }}>
        {icon.glyph}
      </span>
      {marks.map((mark) => (
        <span key={mark.glyph} className="w-5 shrink-0 justify-center" style={{ color: mark.color }}>
          {mark.glyph}
        </span>
      ))}
      <span className={`ms-0.5 min-w-0 truncate ${look.underline ? 'underline' : ''}`} style={{ color: look.color }}>
        {row.name}
      </span>
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
  // Every folder's look comes from the statuses of the files under it.
  const folderLooks = useMemo(() => {
    const statuses = new Map<string, FileStatus[]>()
    for (const path of paths) {
      const status = fileFor(path)?.status
      if (!status) continue
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join('/')
        const list = statuses.get(folder) ?? []
        list.push(status)
        statuses.set(folder, list)
      }
    }
    return new Map([...statuses].map(([folder, list]) => [folder, folderLook(list)]))
  }, [paths, fileFor])
  const lookFor = (row: Row): { marks: Mark[]; color: string } => {
    if (row.kind === 'file') {
      const status = fileFor(row.path)?.status
      return { marks: status ? [STATUS_MARK[status]] : [], color: '' }
    }
    return folderLooks.get(row.path) ?? folderLook([])
  }
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
    // Keyed by path, so folding a folder never hands one row's place to another mid-update.
    getItemKey: (index) => rows[index]?.path ?? index,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })
  // A newly selected file is brought into sight once (picked in search, opened by a link, reached by
  // scrolling the diff), and only when it is out of view. Clicks, folding and other rows moving never
  // pull the tree back to it; a selection whose row is not there yet waits until it appears.
  const reveal = useRef<string | null>(null)
  // A selection that follows from the reader's own click or key in the tree (folding a folder moves the
  // diff, which moves its top file) is marked but not scrolled to: they are already where they want to be.
  const touched = useRef(0)
  useEffect(() => {
    reveal.current = Date.now() - touched.current < SETTLE_MS ? null : selected
  }, [selected])
  useEffect(() => {
    const path = reveal.current
    if (!path) return
    const index = rows.findIndex((row) => row.path === path)
    if (index < 0) return
    reveal.current = null
    const element = scroller.current
    if (!element) return
    const top = index * ROW_HEIGHT
    const visible = top >= element.scrollTop && top + ROW_HEIGHT <= element.scrollTop + element.clientHeight
    if (!visible) virtualizer.scrollToIndex(index, { align: 'center' })
  })
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
    <div
      ref={scroller}
      role="tree"
      aria-label={label}
      className="min-h-0 flex-1 overflow-y-auto py-1"
      onPointerDown={() => {
        touched.current = Date.now()
      }}
      onKeyDown={() => {
        touched.current = Date.now()
      }}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const row = rows[virtual.index]
          if (!row) return null
          const look = lookFor(row)
          return (
            <div
              key={virtual.key}
              className="absolute inset-x-0"
              style={{ transform: `translateY(${virtual.start}px)` }}>
              <WithMenu items={menuFor?.(row)}>
                <TreeItem
                  row={row}
                  file={fileFor(row.path)}
                  marks={look.marks}
                  color={look.color}
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
