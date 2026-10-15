import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { symbolUnder } from './symbol-at'

// A plain click on a name in code opens the symbol panel for it; drags and selections are left alone.
export function useSymbolClick(
  root: () => HTMLElement | null,
  refFor: (side: 'additions' | 'deletions' | null) => string | null,
) {
  const { symbol } = useApp()
  const latest = useRef(refFor)
  latest.current = refFor
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented || event.altKey || event.shiftKey) return
      const element = root()
      if (!element?.contains(event.target as Node)) return
      if (!(window.getSelection()?.isCollapsed ?? true)) return
      const found = symbolUnder(event)
      if (found) symbol.set({ name: found.name, ref: latest.current(found.side) })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [root, symbol])
}
