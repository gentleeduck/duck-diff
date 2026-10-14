import { useVirtualizer } from '@tanstack/react-virtual'
import { forwardRef, type ReactNode, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Note, NoteItem } from '../review/annotations'
import type { Page, PageRow } from './page'
import { LineRow, RowContext, type RowContextValue } from './Rows'

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

// One scroll container for every file; only rows near the viewport are in the DOM.
export const DiffView = forwardRef<DiffViewHandle, DiffViewProps>(function DiffView(
  { page, context, renderHeader, renderNote },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null)
  const lineHeight = Math.round(context.settings.fontSize * 1.5)
  const virtualizer = useVirtualizer({
    count: page.rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => {
      const row = page.rows[index]
      if (!row) return lineHeight
      return row.type === 'row' ? lineHeight : ESTIMATE[row.type]
    },
    getItemKey: (index) => page.rows[index]?.key ?? index,
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
  // The file whose rows fill the top of the view keeps its header pinned above them.
  const [scrollTop, setScrollTop] = useState(0)
  const onScroll = useCallback(() => setScrollTop(scroller.current?.scrollTop ?? 0), [])
  const first = items.find((virtual) => virtual.end > scrollTop)
  const firstRow = first ? page.rows[first.index] : undefined
  const pinned = firstRow && firstRow.type !== 'header' && firstRow.type !== 'end' ? firstRow.item : null

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
        onScroll={onScroll}
        data-diff-view
        data-layout={context.settings.diffStyle === 'split' ? 'split' : 'unified'}
        className="relative h-full overflow-auto"
        style={{
          fontSize: context.settings.fontSize,
          lineHeight: `${lineHeight}px`,
          tabSize: context.settings.tabSize,
        }}>
        {pinned ? (
          <div className="sticky top-0 z-20 h-0">
            <div>{renderHeader(pinned)}</div>
          </div>
        ) : null}
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((virtual) => {
            const row = page.rows[virtual.index]
            if (!row) return null
            return (
              <div
                key={virtual.key}
                ref={virtualizer.measureElement}
                data-index={virtual.index}
                data-row={row.type}
                className="absolute inset-x-0"
                style={{ transform: `translateY(${virtual.start}px)` }}>
                {content(row)}
              </div>
            )
          })}
        </div>
      </div>
    </RowContext.Provider>
  )
})
