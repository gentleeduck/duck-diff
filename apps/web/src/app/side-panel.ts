import type { ResizablePanelHandle } from '@duck-diff/ui'
import { useRef, useState } from 'react'
import { saved } from '../lib/saved'

export interface Sizing {
  key: string
  // Pixels, not percent: a panel needs the same room on every screen width.
  initial: number
  min: number
}

// A side panel's width for duck-ui's resizable panels, kept between visits: where it starts, what a drag
// saves, and the double-click on its edge that puts it back.
export function useSidePanel(sizing: Sizing) {
  const panelRef = useRef<ResizablePanelHandle | null>(null)
  const [defaultSize] = useState(() => {
    try {
      const stored = Number(saved.getItem(sizing.key))
      return stored >= sizing.min ? stored : sizing.initial
    } catch {
      return sizing.initial
    }
  })
  return {
    panel: {
      panelRef,
      defaultSize,
      minSize: sizing.min,
      // A window resize goes to the page, not the panel.
      groupResizeBehavior: 'preserve-pixel-size' as const,
      // The first report is the panel settling in, not a drag.
      onResize: (size: { inPixels: number }, _id: string | number | undefined, previous: unknown) => {
        if (previous === undefined) return
        try {
          saved.setItem(sizing.key, String(Math.round(size.inPixels)))
        } catch {}
      },
    },
    reset: () => panelRef.current?.resize(sizing.initial),
  }
}
