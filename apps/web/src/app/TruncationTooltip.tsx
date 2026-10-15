import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const DELAY_MS = 400
const EDGE = 12

// Any text cut off with an ellipsis shows its whole self on hover, the page over: one listener rather
// than a tooltip on every list row, tab and label. Elements with a title or a tooltip of their own
// (data-own-tooltip) are left to it.
export function TruncationTooltip() {
  const [shown, setShown] = useState<{ text: string; rect: DOMRect } | null>(null)
  useEffect(() => {
    let timer = 0
    const hide = () => {
      clearTimeout(timer)
      setShown(null)
    }
    const over = (event: PointerEvent) => {
      clearTimeout(timer)
      const element = (event.target as Element | null)?.closest?.('.truncate') as HTMLElement | null
      const cut = element && element.scrollWidth > element.clientWidth + 1
      if (!element || !cut || element.closest('[title], [data-own-tooltip]')) return setShown(null)
      timer = window.setTimeout(() => {
        const text = element.textContent?.trim()
        if (text) setShown({ text, rect: element.getBoundingClientRect() })
      }, DELAY_MS)
    }
    document.addEventListener('pointerover', over, { passive: true })
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('scroll', hide, { capture: true, passive: true })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('scroll', hide, { capture: true })
    }
  }, [])
  if (!shown) return null
  const { rect, text } = shown
  const below = window.innerHeight - rect.bottom > 80
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[60] max-w-[min(40rem,calc(100vw-24px))] break-words rounded-md border border-border bg-popover px-2 py-1 text-popover-foreground shadow-md"
      style={{
        left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - 320)),
        ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
      }}>
      {text}
    </div>,
    document.body,
  )
}
