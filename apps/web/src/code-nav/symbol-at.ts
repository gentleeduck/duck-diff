import type { DiffTarget } from '@duck-diff/protocol'

const NAME = /^[A-Za-z_$][\w$]{0,99}$/
const WORD = /[\w$]/
// Words every language uses for syntax; clicking them would only list the whole repo.
const KEYWORDS = new Set(
  `abstract and as async await break case catch class const continue def default del do elif else enum export
extends false final finally fn for from func function go if impl import in interface is let local loop match mod
module mut new nil none not null of or package pass pub raise return self static struct super switch this throw
true try type typeof undefined use var void while with yield`.split(/\s+/),
)

// A clicked name, and where it sits when the code knows its file and line, for asking a language server.
export interface SymbolTarget {
  name: string
  ref: string | null
  // 1-based line and UTF-16 column of the name's first character.
  at?: { path: string; line: number; column: number }
}

// The identifier around a character column of a line, or null on punctuation, numbers and keywords.
export function wordAt(text: string, column: number): string | null {
  return wordSpanAt(text, column)?.word ?? null
}

export function wordSpanAt(text: string, column: number): { word: string; start: number } | null {
  let start = column
  let end = column
  while (start > 0 && WORD.test(text[start - 1] ?? '')) start--
  while (end < text.length && WORD.test(text[end] ?? '')) end++
  const word = text.slice(start, end)
  return word.length >= 2 && NAME.test(word) && !KEYWORDS.has(word) ? { word, start } : null
}

// The revision a side of a diff shows, for searching names as they read there. null is the working tree.
export function refForSide(target: DiffTarget, side: 'additions' | 'deletions'): string | null {
  if (target.kind === 'commit') return side === 'additions' ? target.sha : `${target.sha}^`
  if (target.kind === 'range') return side === 'additions' ? target.to : target.from
  return side === 'additions' ? null : 'HEAD'
}

export interface SymbolUnder {
  name: string
  side: 'additions' | 'deletions' | null
  // The row's scroll key (a diff item or file:path), its line number and the name's 0-based start column.
  key: string | null
  line: number | null
  start: number
  // The name's box on screen, for placing a card under it.
  rect: DOMRect | null
}

// The name under a point in code: the caret position's column within its [data-code] line.
export function symbolAtPoint(target: EventTarget | null, x: number, y: number): SymbolUnder | null {
  const element = target instanceof Element ? target : null
  if (!element || element.closest('button, a, input, textarea')) return null
  const code = element.closest<HTMLElement>('[data-code]')
  if (!code) return null
  const caret = document.caretRangeFromPoint?.(x, y)
  if (!caret || !code.contains(caret.startContainer)) return null
  const before = document.createRange()
  before.setStart(code, 0)
  before.setEnd(caret.startContainer, caret.startOffset)
  const text = code.textContent ?? ''
  const span = wordSpanAt(text, before.toString().length)
  if (!span) return null
  const side = code.closest<HTMLElement>('[data-side]')?.dataset.side
  const line = Number(code.closest<HTMLElement>('[data-line]')?.dataset.line)
  return {
    name: span.word,
    side: side === 'additions' || side === 'deletions' ? side : null,
    key: code.closest<HTMLElement>('[data-scroll-key]')?.dataset.scrollKey ?? null,
    line: Number.isInteger(line) && line > 0 ? line : null,
    start: span.start,
    rect: rangeOf(code, span.start, span.word.length)?.getBoundingClientRect() ?? null,
  }
}

// A DOM range over characters [start, start + length) of an element's text.
function rangeOf(root: Node, start: number, length: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let seen = 0
  let begun = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const size = node.textContent?.length ?? 0
    if (!begun && start < seen + size) {
      range.setStart(node, start - seen)
      begun = true
    }
    if (begun && start + length <= seen + size) {
      range.setEnd(node, start + length - seen)
      return range
    }
    seen += size
  }
  return null
}

export function symbolUnder(event: MouseEvent): SymbolUnder | null {
  return symbolAtPoint(event.target, event.clientX, event.clientY)
}
