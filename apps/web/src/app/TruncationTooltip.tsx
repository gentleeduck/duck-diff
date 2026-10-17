import { Tooltip, TooltipContent, TooltipTrigger } from '@duck-diff/ui'
import { useEffect, useState } from 'react'

const DELAY_MS = 400

// What the page shows on hover, from one listener rather than a tooltip on every row, tab and button:
// - a title, drawn as the page's tooltip instead of the browser's (it moves to data-tip, and names an element
//   that has no other name);
// - the whole of any text cut off with an ellipsis or clamped to a few lines.
// Elements with a duck-ui tooltip of their own (data-own-tooltip) are left to it.
function tipFor(target: Element | null): { element: HTMLElement; text: string } | null {
  if (!target || target.closest('[data-own-tooltip]')) return null
  const titled = target.closest('[title], [data-tip]') as HTMLElement | null
  if (titled) {
    const title = titled.getAttribute('title')
    if (title !== null) {
      titled.dataset.tip = title
      titled.removeAttribute('title')
      if (!titled.hasAttribute('aria-label') && !titled.textContent?.trim()) titled.setAttribute('aria-label', title)
    }
    const text = titled.dataset.tip?.trim()
    return text ? { element: titled, text } : null
  }
  const element = target.closest('.truncate, [class*="line-clamp-"]') as HTMLElement | null
  if (!element) return null
  const cut = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
  const text = element.textContent?.trim()
  return cut && text ? { element, text } : null
}

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
      const tip = tipFor(event.target as Element | null)
      if (!tip) return setShown(null)
      timer = window.setTimeout(() => setShown({ text: tip.text, rect: tip.element.getBoundingClientRect() }), DELAY_MS)
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
  // duck-ui's tooltip, anchored to a still box over the start of the element: the arrow points where the eye
  // already is, and the element itself keeps its own handlers.
  return (
    <Tooltip key={`${rect.left},${rect.top},${text}`} open onOpenChange={(open) => !open && setShown(null)}>
      <TooltipTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed"
          style={{ left: rect.left, top: rect.top, width: Math.min(rect.width, 48), height: rect.height }}
        />
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className="max-w-[min(40rem,calc(100vw-24px))] whitespace-pre-line break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
