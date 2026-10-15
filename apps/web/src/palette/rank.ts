export type Scope = 'all' | 'file' | 'pr' | 'issue' | 'command' | 'number'

// GitHub's palette prefixes: file:, pr:, issue:, > for commands, and #123 for an item by number.
export function parseSearch(input: string): { scope: Scope; term: string } {
  const text = input.trimStart()
  const prefix = /^(file|files|pr|prs|issue|issues):\s*/i.exec(text)
  if (prefix) {
    const word = (prefix[1] ?? '').toLowerCase().replace(/s$/, '') as 'file' | 'pr' | 'issue'
    return { scope: word, term: text.slice(prefix[0].length).trim() }
  }
  if (text.startsWith('>')) return { scope: 'command', term: text.slice(1).trim() }
  if (/^#\d*$/.test(text.trim())) return { scope: 'number', term: text.trim().slice(1) }
  return { scope: 'all', term: text.trim() }
}

// How well text matches what was typed: whole substrings beat scattered letters, earlier and in the
// last path segment beat later. Zero means no match.
export function score(term: string, text: string): number {
  if (!term) return 1
  const needle = term.toLowerCase()
  const hay = text.toLowerCase()
  const at = hay.indexOf(needle)
  if (at !== -1) {
    const base = hay.lastIndexOf('/') + 1
    return 1000 - at + (at >= base ? 500 : 0) - (hay.length - needle.length) / 100
  }
  let from = 0
  for (const char of needle) {
    const found = hay.indexOf(char, from)
    if (found === -1) return 0
    from = found + 1
  }
  return 100 - from / 10
}

export function rank<T>(items: readonly T[], term: string, textOf: (item: T) => string, limit: number): T[] {
  if (!term) return items.slice(0, limit)
  return items
    .map((item) => ({ item, points: score(term, textOf(item)) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((entry) => entry.item)
}
