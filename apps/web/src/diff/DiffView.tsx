import { useVirtualizer } from '@tanstack/react-virtual'
import { forwardRef, type ReactNode, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { Note, NoteItem } from '../review/annotations'
import type { Page, PageRow } from './page'
import { LineRow, RowContext, type RowContextValue } from './RowViews'
import { useCodeScrollX } from './useCodeScrollX'

export type ScrollTarget =
  | { type: 'item'; id: string; align?: 'start' | 'center' }
  | { type: 'line'; id: string; lineNumber: number; side: 'additions' | 'deletions'; align?: 'start' | 'center' }

export interface DiffViewHandle {
  scrollTo(target: ScrollTarget): void
}

interface DiffViewProps {
  page: Page
  context: RowContextValue
  renderHeader(item: NoteItem): ReactNode
  renderNote(note: Note): ReactNode
}

const ESTIMATE: Record<PageRow['type'], number> = { header: 48, row: 22, note: 120, end: 16 }

const PREFETCH_ROWS = 600
const PREFETCH_FILES = 4

const fixedHeight = (row: PageRow, wrap: boolean) =>
  !wrap && row.type === 'row' && (row.row.type === 'line' || row.row.type === 'pair')

// One scroll container for every file; only rows near the viewport are in the DOM.
export const DiffView = forwardRef<DiffViewHandle, DiffViewProps>(function DiffView(
  { page, context, renderHeader, renderNote },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null)
  const lineHeight = Math.round(context.settings.fontSize * 1.5)
  const wrap = context.settings.overflow === 'wrap'
  // A new key or size function makes the virtualizer re-measure every row, so both stay stable per page.
  const estimateSize = useCallback(
    (index: number) => {
      const row = page.rows[index]
      if (!row) return lineHeight
      return row.type === 'row' ? lineHeight : ESTIMATE[row.type]
    },
    [page, lineHeight],
  )
  // Each file's longest line, in columns, sets how far that file can scroll sideways.
  const widest = useMemo(() => {
    const tab = context.settings.tabSize
    const columns = (text: string | undefined) => {
      if (!text) return 0
      let tabs = 0
      for (let i = text.indexOf('\t'); i !== -1; i = text.indexOf('\t', i + 1)) tabs++
      return text.length + tabs * (tab - 1)
    }
    const byFile = new Map<string, number>()
    for (const row of page.rows) {
      if (row.type !== 'row') continue
      const diff = row.row
      const width =
        diff.type === 'line'
          ? columns(diff.line.text)
          : diff.type === 'pair'
            ? Math.max(columns(diff.left?.text), columns(diff.right?.text))
            : 0
      if (width > (byFile.get(row.item.id) ?? 0)) byFile.set(row.item.id, width)
    }
    return byFile
  }, [page, context.settings.tabSize])
  const sideways = useCodeScrollX(scroller, widest, !wrap)
  const getItemKey = useCallback((index: number) => page.rows[index]?.key ?? index, [page])
  const virtualizer = useVirtualizer({
    count: page.rows.length,
    getScrollElement: () => scroller.current,
    estimateSize,
    getItemKey,
    overscan: 12,
  })

  useImperativeHandle(
    ref,
    () => ({
      scrollTo(target) {
        const index =
          target.type === 'item'
            ? page.starts.get(target.id)
            : (page.lines.get(`${target.id}:${target.side}:${target.lineNumber}`) ?? page.starts.get(target.id))
        if (index !== undefined) virtualizer.scrollToIndex(index, { align: target.align ?? 'start' })
      },
    }),
    [page, virtualizer],
  )

  const items = virtualizer.getVirtualItems()
  // The next few files below the viewport get their colors started, so fast scrolling lands on them ready.
  const lastIndex = items.at(-1)?.index ?? 0
  useEffect(() => {
    let seen = 0
    let previous: string | null = null
    for (let i = lastIndex; i < page.rows.length && i < lastIndex + PREFETCH_ROWS && seen < PREFETCH_FILES; i++) {
      const item = page.rows[i]?.item
      if (!item || item.id === previous) continue
      previous = item.id
      seen++
      context.prefetch(item)
    }
  }, [lastIndex, page, context])
  // The file at the top keeps its header pinned. It takes over as soon as the file's own header starts to
  // scroll away (not once it is gone), so there is never a frame without one; the gap after a file
  // already belongs to the next.
  const scrollTop = virtualizer.scrollOffset ?? 0
  const first = items.find((virtual) => virtual.end > scrollTop)
  const firstRow = first ? page.rows[first.index] : undefined
  const pinned =
    !first || !firstRow
      ? null
      : firstRow.type === 'end'
        ? (page.rows[first.index + 1]?.item ?? null)
        : firstRow.type === 'header' && first.start >= scrollTop
          ? null
          : firstRow.item

  const content = useMemo(
    () => (row: PageRow) => {
      if (row.type === 'header') return renderHeader(row.item)
      if (row.type === 'note') return renderNote(row.note)
      if (row.type === 'end') return <div className="h-4" />
      return <LineRow item={row.item} row={row.row} />
    },
    [renderHeader, renderNote],
  )

  return (
    <RowContext.Provider value={context}>
      <div
        ref={scroller}
        data-diff-view
        data-layout={context.settings.diffStyle === 'split' ? 'split' : 'unified'}
        className="relative h-full overflow-auto"
        style={{
          fontSize: context.settings.fontSize,
          lineHeight: `${lineHeight}px`,
          tabSize: context.settings.tabSize,
        }}>
        {sideways.probe}
        {pinned ? (
          <div className="sticky top-0 z-20 h-0">
            <div className="bg-card shadow-[0_1px_0_var(--border)]">{renderHeader(pinned)}</div>
          </div>
        ) : null}
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((virtual) => {
            const row = page.rows[virtual.index]
            if (!row) return null
            return (
              <div
                key={virtual.key}
                // Unwrapped code lines are exactly one line tall, so only they skip measuring; hunk headers
                // and gap buttons can wrap or run taller.
                ref={fixedHeight(row, wrap) ? undefined : virtualizer.measureElement}
                data-index={virtual.index}
                data-row={row.type}
                className="absolute inset-x-0"
                {...sideways.rowProps(row.item.id)}
                style={{ ...sideways.rowProps(row.item.id).style, transform: `translateY(${virtual.start}px)` }}>
                {content(row)}
              </div>
            )
          })}
        </div>
        {sideways.scrollbar}
      </div>
    </RowContext.Provider>
  )
})
