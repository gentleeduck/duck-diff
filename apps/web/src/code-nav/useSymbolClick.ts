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

// A plain click on a name opens the symbol panel; Ctrl or Cmd click jumps to its definition. Drags and
// selections are left alone.
export function useSymbolClick(root: () => HTMLElement | null, locate: LocateSymbol) {
  const app = useApp()
  const { show } = useView()
  const latest = useRef(locate)
  latest.current = locate
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented || event.altKey || event.shiftKey) return
      const element = root()
      if (!element?.contains(event.target as Node)) return
      if (!(window.getSelection()?.isCollapsed ?? true)) return
      const found = symbolUnder(event)
      if (!found) return
      const target = targetOf(found, latest.current)
      if ((event.ctrlKey || event.metaKey) && target.at) {
        event.preventDefault()
        void goToDefinition(app, target, () => show('files'))
      } else app.symbol.set(target)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [root, app, show])
}
