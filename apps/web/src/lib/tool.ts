import type { ToolSpec } from '@duck-diff/protocol'
import { readKept, writeKept } from './kept'

export interface ToolState {
  spec: ToolSpec | null
  // git has what it asked for; the window closes unless git asks for more.
  done: boolean
}

// The git tool this window was opened for (duck-diff mergetool, difftool, rebase-todo), by the id the server
// gave it, or null in an ordinary window. The address loses it as soon as the page navigates; a reload keeps it.
export function readToolId(): string | null {
  if (typeof window === 'undefined') return null
  const given = new URLSearchParams(window.location.search).get('tool')
  if (given) writeKept('tool-id', given)
  return given ?? readKept<string | null>('tool-id', null)
}
