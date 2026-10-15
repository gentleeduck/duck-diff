import { type CSSProperties, type RefObject, useCallback, useEffect, useRef } from 'react'

// Rows are virtual, so no row can own a native scrollbar. Each file keeps its own sideways offset, written
// as a CSS variable on its rows (line numbers stay put), and draws its own bar along its bottom edge.
export function useCodeScrollX(
  scroller: RefObject<HTMLDivElement | null>,
  widest: ReadonlyMap<string, number>,
  enabled: boolean,
) {
  const offsets = useRef(new Map<string, number>())

  const select = useCallback(
    (selector: string, key: string) =>
      scroller.current?.querySelectorAll<HTMLElement>(selector.replace('KEY', CSS.escape(key))) ?? [],
    [scroller],
  )

  const limits = useCallback(
    (key: string) => {
      const code = select('[data-scroll-key="KEY"] [data-code]', key)[0]
      const probe = scroller.current?.querySelector<HTMLElement>('[data-ch]')
      if (!code || !probe) return null
      const ch = probe.getBoundingClientRect().width / 10
      const view = code.clientWidth
      const content = (widest.get(key) ?? 0) * ch + 32
      return { view, max: Math.max(0, content - view), content }
    },
    [scroller, select, widest],
  )

  const paint = useCallback(
    (key: string) => {
      const room = limits(key)
      for (const bar of select('[data-bar-key="KEY"]', key)) {
        const thumb = bar.firstElementChild as HTMLElement | null
        bar.hidden = !room || room.max === 0
        if (!room || !thumb || room.max === 0) continue
        const track = bar.clientWidth
        const size = Math.max(32, (room.view / room.content) * track)
        thumb.style.width = `${size}px`
        thumb.style.transform = `translateX(${((offsets.current.get(key) ?? 0) / room.max) * (track - size)}px)`
      }
    },
    [limits, select],
  )

  const apply = useCallback(
    (key: string, next: number) => {
      const room = limits(key)
      if (!room) return
      const offset = Math.min(room.max, Math.max(0, next))
      offsets.current.set(key, offset)
      for (const row of select('[data-scroll-key="KEY"]', key)) row.style.setProperty('--code-x', `${offset}px`)
      paint(key)
    },
    [limits, select, paint],
  )

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    if (!enabled) {
      offsets.current.clear()
      return
    }
    const keyAt = (target: EventTarget | null) =>
      (target instanceof Element ? target.closest<HTMLElement>('[data-scroll-key],[data-bar-key]') : null)?.dataset
    // Trackpads send deltaX; a mouse wheel with Shift held means sideways too.
    const onWheel = (event: WheelEvent) => {
      const sideways =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0
      const data = keyAt(event.target)
      const key = data?.scrollKey ?? data?.barKey
      if (!sideways || !key) return
      event.preventDefault()
      apply(key, (offsets.current.get(key) ?? 0) + sideways)
    }
    // Bars mount as their files scroll into view and resize with the page; both repaint them.
    const repaint = () => {
      const keys = new Set([...root.querySelectorAll<HTMLElement>('[data-bar-key]')].map((bar) => bar.dataset.barKey))
      for (const key of keys) if (key) paint(key)
    }
    const observer = new ResizeObserver(repaint)
    observer.observe(root)
    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('scroll', repaint, { passive: true })
    repaint()
    return () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('scroll', repaint)
      observer.disconnect()
    }
  }, [scroller, enabled, apply, paint])

  const dragThumb = (key: string, event: React.PointerEvent<HTMLElement>) => {
    const room = limits(key)
    const bar = event.currentTarget.parentElement
    const track = bar?.clientWidth ?? 0
    const size = event.currentTarget.clientWidth
    if (!room || track <= size) return
    event.preventDefault()
    event.stopPropagation()
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

  // A file's own bar; the caller places it at the bottom of what shows of that file.
  const bar = (key: string, style?: CSSProperties, className = '') =>
    enabled ? (
      <div
        key={`bar:${key}`}
        data-bar-key={key}
        role="presentation"
        hidden
        style={style}
        ref={(element) => {
          if (element) requestAnimationFrame(() => paint(key))
        }}
        className={`z-10 h-2.5 bg-background/70 ${className}`}
        onPointerDown={(event) => {
          const room = limits(key)
          if (event.target !== event.currentTarget || !room) return
          const rect = event.currentTarget.getBoundingClientRect()
          apply(key, ((event.clientX - rect.left) / rect.width) * room.content - room.view / 2)
        }}>
        <div
          onPointerDown={(event) => dragThumb(key, event)}
          className="h-full cursor-pointer rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60"
        />
      </div>
    ) : null

  // Ten zeros in the code font, measured to turn character counts into pixels.
  const probe = (
    <code data-ch aria-hidden className="invisible absolute whitespace-pre">
      0000000000
    </code>
  )
  // Rows mounting while scrolling start at their file's offset.
  const rowStyle = (key: string) => ({ '--code-x': `${offsets.current.get(key) ?? 0}px` }) as CSSProperties
  return { bar, probe, rowStyle }
}
