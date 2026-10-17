import { Button, Kbd, Popover, PopoverAnchor, PopoverContent } from '@duck-diff/ui'
import { MessageSquarePlus, Minus, Plus, Undo2 } from 'lucide-react'
import { useEffect } from 'react'
import { DANGER } from '../app/IconTool'
import type { WriteKind } from './actions'

// What can be done with the lines a drag picked: comment on them, or stage, unstage or discard just them.
export function SelectionBar({
  rect,
  count,
  kinds,
  onComment,
  onWrite,
  onClose,
}: {
  rect: DOMRect
  count: number
  kinds: WriteKind[]
  onComment(): void
  onWrite(kind: WriteKind): void
  onClose(): void
}) {
  const main = kinds.includes('stage') ? 'stage' : kinds.includes('unstage') ? 'unstage' : null
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as Element | null)?.closest('input, textarea, [contenteditable]')
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Escape') onClose()
      else if (event.key === 's' && main) onWrite(main)
      else if (event.key === 'c') onComment()
      else return
      // Ahead of the page's own s, which would stage the whole hunk under the pointer.
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('[data-selection-bar]')) onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [main, onWrite, onComment, onClose])
  const lines = `${count} ${count === 1 ? 'line' : 'lines'}`
  // duck-ui's popover, anchored to a still box at the start of the picked lines.
  return (
    <Popover key={`${rect.left},${rect.top},${rect.height}`} open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed"
          style={{ left: rect.left, top: rect.top, width: Math.min(rect.width, 48), height: rect.height }}
        />
      </PopoverAnchor>
      <PopoverContent
        data-selection-bar
        role="toolbar"
        aria-label={`Selected ${lines}`}
        side="bottom"
        align="start"
        sideOffset={6}
        // The keyboard stays in the diff, where s and c act on the lines.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="flex w-auto items-center gap-1 whitespace-nowrap p-1">
        <span className="px-2 text-muted-foreground">{lines}</span>
        {main === 'stage' ? (
          <Button size="sm" onClick={() => onWrite('stage')}>
            <Plus />
            Stage lines <Kbd>s</Kbd>
          </Button>
        ) : null}
        {main === 'unstage' ? (
          <Button size="sm" onClick={() => onWrite('unstage')}>
            <Minus />
            Unstage lines <Kbd>s</Kbd>
          </Button>
        ) : null}
        {kinds.includes('discard') ? (
          <Button size="sm" variant="ghost" className={DANGER} onClick={() => onWrite('discard')}>
            <Undo2 />
            Discard lines
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onComment}>
          <MessageSquarePlus />
          Comment <Kbd>c</Kbd>
        </Button>
      </PopoverContent>
    </Popover>
  )
}
