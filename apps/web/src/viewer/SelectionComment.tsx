import { Button } from '@duck-diff/ui'
import { MessageSquarePlus } from 'lucide-react'
import { useEffect, useState } from 'react'

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

// Selecting words in the code offers a comment on exactly those words, as a button beside the selection.
export function SelectionComment({
  root,
  onComment,
}: {
  root: () => HTMLElement | null
  onComment(selection: CodeSelection): void
}) {
  const [found, setFound] = useState<{ selection: CodeSelection; rect: DOMRect } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const element = root()
        setFound(element ? readSelection(element) : null)
      }, 120)
    }
    const hide = () => setFound(null)
    document.addEventListener('selectionchange', check)
    const element = root()
    element?.addEventListener('scroll', hide, { passive: true })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', check)
      element?.removeEventListener('scroll', hide)
    }
  }, [root])
  if (!found) return null
  return (
    <div className="fixed z-40" style={{ top: found.rect.bottom + 6, left: Math.max(8, found.rect.right - 140) }}>
      <Button
        size="sm"
        className="shadow-md"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onComment(found.selection)
          window.getSelection()?.removeAllRanges()
          setFound(null)
        }}>
        <MessageSquarePlus />
        Comment
      </Button>
    </div>
  )
}
