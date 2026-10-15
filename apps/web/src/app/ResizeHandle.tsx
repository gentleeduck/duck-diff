import { useState } from 'react'

interface Sizing {
  key: string
  // Pixels, not percent: a panel needs the same room on every screen width.
  initial: number
  min: number
  // The share of the window a panel may take at most.
  maxShare: number
}

const clamp = (sizing: Sizing, width: number) =>
  Math.round(Math.min(window.innerWidth * sizing.maxShare, Math.max(sizing.min, width)))

// A panel width that is kept between visits.
export function useStoredWidth(sizing: Sizing): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(sizing.key))
      return stored ? clamp(sizing, stored) : sizing.initial
    } catch {
      return sizing.initial
    }
  })
  const save = (next: number) => {
    const fitted = clamp(sizing, next)
    setWidth(fitted)
    try {
      window.localStorage.setItem(sizing.key, String(fitted))
    } catch {}
  }
  return [width, save]
}

// Dragging resizes the panel beside it; double-click puts it back. A panel on the right grows as the
// edge moves left.
export function ResizeHandle({
  label,
  width,
  initial,
  side,
  onResize,
}: {
  label: string
  width: number
  initial: number
  side: 'left' | 'right'
  onResize(width: number): void
}) {
  return (
    <hr
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      onDoubleClick={() => onResize(initial)}
      onPointerDown={(event) => {
        event.preventDefault()
        const startX = event.clientX
        const direction = side === 'left' ? 1 : -1
        const move = (moved: PointerEvent) => onResize(width + direction * (moved.clientX - startX))
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.style.removeProperty('cursor')
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      className="relative m-0 h-full w-px shrink-0 cursor-col-resize border-0 bg-border after:absolute after:inset-y-0 after:-inset-x-1.5 hover:bg-tn-blue"
    />
  )
}
