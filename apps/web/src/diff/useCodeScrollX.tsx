import { type RefObject, useCallback, useEffect, useRef } from 'react'

// Rows are virtual, so each one cannot own a scrollbar. Instead the whole diff shares one sideways offset,
// written to a CSS variable the code cells translate by; line numbers stay put, as on GitHub.
export function useCodeScrollX(scroller: RefObject<HTMLDivElement | null>, widestChars: number, enabled: boolean) {
  const offset = useRef(0)
  const bar = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)

  const limits = useCallback(() => {
    const root = scroller.current
    const code = root?.querySelector<HTMLElement>('[data-code]')
    const probe = root?.querySelector<HTMLElement>('[data-ch]')
    if (!root || !code || !probe) return null
    const ch = probe.getBoundingClientRect().width / 10
    const view = code.clientWidth
    const content = widestChars * ch + 32
    return { view, max: Math.max(0, content - view), content }
  }, [scroller, widestChars])

  const apply = useCallback(
    (next: number) => {
      const root = scroller.current
      const room = limits()
      if (!root || !room) return
      offset.current = Math.min(room.max, Math.max(0, next))
      root.style.setProperty('--code-x', `${offset.current}px`)
      if (bar.current && thumb.current) {
        bar.current.hidden = room.max === 0
        const track = bar.current.clientWidth
        const size = Math.max(32, (room.view / room.content) * track)
        thumb.current.style.width = `${size}px`
        thumb.current.style.transform = `translateX(${room.max ? (offset.current / room.max) * (track - size) : 0}px)`
      }
    },
    [scroller, limits],
  )

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    if (!enabled) {
      root.style.setProperty('--code-x', '0px')
      if (bar.current) bar.current.hidden = true
      return
    }
    apply(offset.current)
    // Trackpads send deltaX; a mouse wheel with Shift held means sideways too.
    const onWheel = (event: WheelEvent) => {
      const sideways =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0
      if (!sideways) return
      event.preventDefault()
      apply(offset.current + sideways)
    }
    const observer = new ResizeObserver(() => apply(offset.current))
    observer.observe(root)
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [scroller, enabled, apply])

  const onThumbDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const room = limits()
    const track = bar.current?.clientWidth ?? 0
    const size = thumb.current?.clientWidth ?? 0
    if (!room || track <= size) return
    event.preventDefault()
    const startX = event.clientX
    const start = offset.current
    const move = (moved: PointerEvent) => apply(start + ((moved.clientX - startX) / (track - size)) * room.max)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const scrollbar = enabled ? (
    <div className="pointer-events-none sticky bottom-0 z-20 h-0">
      <div
        ref={bar}
        hidden
        role="presentation"
        className="pointer-events-auto absolute inset-x-0 bottom-0 h-2.5 bg-background/60"
        onPointerDown={(event) => {
          if (event.target !== bar.current) return
          const room = limits()
          if (!room || !bar.current) return
          const rect = bar.current.getBoundingClientRect()
          apply(((event.clientX - rect.left) / rect.width) * room.content - room.view / 2)
        }}>
        <div
          ref={thumb}
          onPointerDown={onThumbDown}
          className="h-full cursor-pointer rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60"
        />
      </div>
    </div>
  ) : null

  // Ten zeros in the code font, measured to turn character counts into pixels.
  const probe = (
    <code data-ch aria-hidden className="invisible absolute whitespace-pre">
      0000000000
    </code>
  )
  return { scrollbar, probe, refresh: () => apply(offset.current) }
}
