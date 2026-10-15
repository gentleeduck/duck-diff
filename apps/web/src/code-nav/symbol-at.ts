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

// The identifier around a character column of a line, or null on punctuation, numbers and keywords.
export function wordAt(text: string, column: number): string | null {
  let start = column
  let end = column
  while (start > 0 && WORD.test(text[start - 1] ?? '')) start--
  while (end < text.length && WORD.test(text[end] ?? '')) end++
  const word = text.slice(start, end)
  return word.length >= 2 && NAME.test(word) && !KEYWORDS.has(word) ? word : null
}

// The revision a side of a diff shows, for searching names as they read there. null is the working tree.
export function refForSide(target: DiffTarget, side: 'additions' | 'deletions'): string | null {
  if (target.kind === 'commit') return side === 'additions' ? target.sha : `${target.sha}^`
  if (target.kind === 'range') return side === 'additions' ? target.to : target.from
  return side === 'additions' ? null : 'HEAD'
}

// The name under a click in code: the caret position's column within its [data-code] line.
export function symbolUnder(event: MouseEvent): { name: string; side: 'additions' | 'deletions' | null } | null {
  const target = event.target as Element | null
  if (!target || target.closest('button, a, input, textarea')) return null
  const code = target.closest<HTMLElement>('[data-code]')
  if (!code) return null
  const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY)
  if (!caret || !code.contains(caret.startContainer)) return null
  const before = document.createRange()
  before.setStart(code, 0)
  before.setEnd(caret.startContainer, caret.startOffset)
  const name = wordAt(code.textContent ?? '', before.toString().length)
  if (!name) return null
  const side = code.closest<HTMLElement>('[data-side]')?.dataset.side
  return { name, side: side === 'additions' || side === 'deletions' ? side : null }
}
