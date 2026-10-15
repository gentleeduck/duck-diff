import { type CSSProperties, type RefObject, useCallback, useEffect, useRef } from 'react'

// Rows are virtual, so no row can own a scrollbar. Each file keeps its own sideways offset instead, written
// as a CSS variable on its rows; line numbers stay put, as on GitHub. The bar at the bottom follows the
// file under the pointer.
export function useCodeScrollX(
  scroller: RefObject<HTMLDivElement | null>,
  widest: ReadonlyMap<string, number>,
  enabled: boolean,
) {
  const offsets = useRef(new Map<string, number>())
  const active = useRef<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)

  const rowsOf = useCallback(
    (key: string) => scroller.current?.querySelectorAll<HTMLElement>(`[data-scroll-key="${CSS.escape(key)}"]`) ?? [],
    [scroller],
  )

  const limits = useCallback(
    (key: string) => {
      const root = scroller.current
      const code = root?.querySelector<HTMLElement>(`[data-scroll-key="${CSS.escape(key)}"] [data-code]`)
      const probe = root?.querySelector<HTMLElement>('[data-ch]')
      if (!code || !probe) return null
      const ch = probe.getBoundingClientRect().width / 10
      const view = code.clientWidth
      const content = (widest.get(key) ?? 0) * ch + 32
      return { view, max: Math.max(0, content - view), content }
    },
    [scroller, widest],
  )

  const paintBar = useCallback(() => {
    const key = active.current
    const room = key === null ? null : limits(key)
    if (!bar.current || !thumb.current) return
    bar.current.hidden = !room || room.max === 0
    if (!room || !key || room.max === 0) return
    const offset = offsets.current.get(key) ?? 0
    const track = bar.current.clientWidth
    const size = Math.max(32, (room.view / room.content) * track)
    thumb.current.style.width = `${size}px`
    thumb.current.style.transform = `translateX(${(offset / room.max) * (track - size)}px)`
  }, [limits])

  const apply = useCallback(
    (key: string, next: number) => {
      const room = limits(key)
      if (!room) return
      const offset = Math.min(room.max, Math.max(0, next))
      offsets.current.set(key, offset)
      for (const row of rowsOf(key)) row.style.setProperty('--code-x', `${offset}px`)
      paintBar()
    },
    [limits, rowsOf, paintBar],
  )

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    if (!enabled) {
      offsets.current.clear()
      if (bar.current) bar.current.hidden = true
      return
    }
    const keyAt = (target: EventTarget | null) =>
      (target instanceof Element ? target.closest<HTMLElement>('[data-scroll-key]') : null)?.dataset.scrollKey ?? null
    // Trackpads send deltaX; a mouse wheel with Shift held means sideways too.
    const onWheel = (event: WheelEvent) => {
      const sideways =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0
      const key = keyAt(event.target)
      if (!sideways || key === null) return
      event.preventDefault()
      active.current = key
      apply(key, (offsets.current.get(key) ?? 0) + sideways)
    }
    const onMove = (event: PointerEvent) => {
      if (event.buttons) return
      const key = keyAt(event.target)
      if (key === null || key === active.current) return
      active.current = key
      paintBar()
    }
    const observer = new ResizeObserver(paintBar)
    observer.observe(root)
    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('pointermove', onMove)
    return () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointermove', onMove)
      observer.disconnect()
    }
  }, [scroller, enabled, apply, paintBar])

  const onThumbDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const key = active.current
    const room = key === null ? null : limits(key)
    const track = bar.current?.clientWidth ?? 0
    const size = thumb.current?.clientWidth ?? 0
    if (!key || !room || track <= size) return
    event.preventDefault()
    const startX = event.clientX
    const start = offsets.current.get(key) ?? 0
    const move = (moved: PointerEvent) => apply(key, start + ((moved.clientX - startX) / (track - size)) * room.max)
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
          const key = active.current
          const room = key === null ? null : limits(key)
          if (event.target !== bar.current || !key || !room || !bar.current) return
          const rect = bar.current.getBoundingClientRect()
          apply(key, ((event.clientX - rect.left) / rect.width) * room.content - room.view / 2)
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
  // Rows mounting while scrolling start at their file's offset.
  const rowProps = (key: string) => ({
    'data-scroll-key': key,
    style: { '--code-x': `${offsets.current.get(key) ?? 0}px` } as CSSProperties,
  })
  return { scrollbar, probe, rowProps }
}
