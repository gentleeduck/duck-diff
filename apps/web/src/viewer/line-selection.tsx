import { useEffect, useRef } from 'react'

export interface CodeSelection {
  item: string
  side: 'additions' | 'deletions'
  startLine: number
  startCol: number
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

export function readSelection(root: HTMLElement): { selection: CodeSelection; rect: DOMRect } | null {
  const picked = window.getSelection()
  if (!picked || picked.isCollapsed || !picked.rangeCount || !picked.anchorNode || !picked.focusNode) return null
  if (!root.contains(picked.anchorNode) || !root.contains(picked.focusNode)) return null
  const a = locate(picked.anchorNode, picked.anchorOffset)
  const b = locate(picked.focusNode, picked.focusOffset)
  if (!a || !b || a.item !== b.item || a.side !== b.side) return null
  const [first, last] = a.line < b.line || (a.line === b.line && a.col <= b.col) ? [a, b] : [b, a]
  if (first.line === last.line && first.col === last.col) return null
  return {
    selection: {
      item: first.item,
      side: first.side,
      startLine: first.line,
      startCol: first.col,
      endLine: last.line,
      endCol: last.col,
    },
    rect: picked.getRangeAt(0).getBoundingClientRect(),
  }
}

// Dragging over code selects lines, not text: the lines light up as one block while the mouse is down,
// and letting go opens a comment on them. Part of one line keeps its exact words.
export function useLineSelection(
  root: () => HTMLElement | null,
  onSelecting: (selection: CodeSelection | null) => void,
  onDone: (selection: CodeSelection) => void,
) {
  const latest = useRef({ onSelecting, onDone })
  latest.current = { onSelecting, onDone }
  useEffect(() => {
    let down = false
    let current: CodeSelection | null = null
    const onDown = (event: PointerEvent) => {
      const element = root()
      down = event.button === 0 && Boolean(element?.contains(event.target as Node))
      current = null
    }
    const onChange = () => {
      const element = root()
      if (!down || !element) return
      current = readSelection(element)?.selection ?? null
      latest.current.onSelecting(current)
    }
    const onUp = () => {
      if (!down) return
      down = false
      const picked = current
      current = null
      latest.current.onSelecting(null)
      if (!picked) return
      window.getSelection()?.removeAllRanges()
      latest.current.onDone(picked)
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
