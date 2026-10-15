import { useEffect, useRef } from 'react'

export interface CodeSelection {
  item: string
  side: 'additions' | 'deletions'
  startLine: number
  startCol: number
  // A stacked diff interleaves both sides, so a drag can end on the other one.
  endSide: 'additions' | 'deletions'
  endLine: number
  endCol: number
}

// Where a selection end sits in the code: its file, side, line and character column.
function locate(node: Node, offset: number) {
  const element = node instanceof Element ? node : node.parentElement
  const code = element?.closest<HTMLElement>('[data-code]')
  const cell = element?.closest<HTMLElement>('[data-line]')
  const row = element?.closest<HTMLElement>('[data-scroll-key]')
  if (!code || !cell || !row?.dataset.scrollKey) return null
  const before = document.createRange()
  before.setStart(code, 0)
  before.setEnd(node, offset)
  return {
    item: row.dataset.scrollKey,
    side: cell.dataset.side as CodeSelection['side'],
    line: Number(cell.dataset.line),
    col: before.toString().length,
  }
}

function endCode(node: Node): HTMLElement | null {
  return (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-code]') ?? null
}

export function readSelection(root: HTMLElement): { selection: CodeSelection; rect: DOMRect } | null {
  const picked = window.getSelection()
  if (!picked || picked.isCollapsed || !picked.rangeCount) return null
  // The range runs in page order whichever way the mouse went.
  const range = picked.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const first = locate(range.startContainer, range.startOffset)
  const last = locate(range.endContainer, range.endOffset)
  if (!first || !last || first.item !== last.item) return null
  if (first.side === last.side && first.line === last.line && first.col === last.col) return null
  return {
    selection: {
      item: first.item,
      side: first.side,
      startLine: first.line,
      startCol: first.col,
      endSide: last.side,
      endLine: last.line,
      endCol: last.col,
    },
    // Under the line the drag ended on; the range's own box spans both columns of a split diff.
    rect: (endCode(range.endContainer) ?? range).getBoundingClientRect(),
  }
}

// Dragging over code selects lines, not text: the lines light up as one block while the mouse is down,
// and letting go opens a comment on them. Part of one line keeps its exact words. Only a drag counts: a
// double-click selecting a word (which opens the symbol panel) never opens the bar.
export function useLineSelection(
  root: () => HTMLElement | null,
  onSelecting: (selection: CodeSelection | null) => void,
  onDone: (selection: CodeSelection, rect: DOMRect) => void,
) {
  const latest = useRef({ onSelecting, onDone })
  latest.current = { onSelecting, onDone }
  useEffect(() => {
    let down = false
    let start = { x: 0, y: 0 }
    let current: { selection: CodeSelection; rect: DOMRect } | null = null
    const onDown = (event: PointerEvent) => {
      const element = root()
      down = event.button === 0 && event.detail < 2 && Boolean(element?.contains(event.target as Node))
      start = { x: event.clientX, y: event.clientY }
      current = null
    }
    const onChange = () => {
      const element = root()
      if (!down || !element) return
      current = readSelection(element)
      latest.current.onSelecting(current?.selection ?? null)
    }
    const onUp = (event: PointerEvent) => {
      if (!down) return
      down = false
      const picked = current
      current = null
      latest.current.onSelecting(null)
      const dragged = Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4
      if (!picked || !dragged) return
      window.getSelection()?.removeAllRanges()
      latest.current.onDone(picked.selection, picked.rect)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('selectionchange', onChange)
    document.addEventListener('pointerup', onUp, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('selectionchange', onChange)
      document.removeEventListener('pointerup', onUp, true)
    }
  }, [root])
}
