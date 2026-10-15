import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useView } from '../hooks/useView'
import { goToDefinition } from './navigate'
import type { SymbolTarget, SymbolUnder } from './symbol-at'
import { symbolUnder } from './symbol-at'

// What a name in this view refers to: the revision it reads at and, when known, the file it sits in.
export type LocateSymbol = (found: SymbolUnder) => { ref: string | null; path: string | null }

export function targetOf(found: SymbolUnder, locate: LocateSymbol): SymbolTarget {
  const { ref, path } = locate(found)
  return {
    name: found.name,
    ref,
    ...(path && found.line ? { at: { path, line: found.line, column: found.start + 1 } } : {}),
  }
}

// A double-click on a name opens the symbol panel; Ctrl or Cmd click jumps to its definition. A single click
// only places the cursor, and drags are left to line selection.
export function useSymbolClick(root: () => HTMLElement | null, locate: LocateSymbol) {
  const app = useApp()
  const { show } = useView()
  const latest = useRef(locate)
  latest.current = locate
  useEffect(() => {
    const nameAt = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented || event.altKey || event.shiftKey) return null
      const element = root()
      if (!element?.contains(event.target as Node)) return null
      const found = symbolUnder(event)
      return found ? targetOf(found, latest.current) : null
    }
    const onClick = (event: MouseEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !(window.getSelection()?.isCollapsed ?? true)) return
      const target = nameAt(event)
      if (!target?.at) return
      event.preventDefault()
      void goToDefinition(app, target, () => show('files'))
    }
    const onDouble = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey) return
      const target = nameAt(event)
      if (!target) return
      // The browser selected the word; the panel is what the double-click was for.
      window.getSelection()?.removeAllRanges()
      app.symbol.set(target)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('dblclick', onDouble)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('dblclick', onDouble)
    }
  }, [root, app, show])
}
