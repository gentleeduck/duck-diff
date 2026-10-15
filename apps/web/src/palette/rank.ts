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

// Edits between two words, a swap of neighbours counting as one (so markteplace is one from marketplace).
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) (rows[0] as number[])[j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = rows[i] as number[]
      const up = rows[i - 1] as number[]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min((up[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (up[j - 1] ?? 0) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j] ?? 0, ((rows[i - 2] as number[])[j - 2] ?? 0) + 1)
    }
  }
  return (rows[a.length] as number[])[b.length] ?? 0
}

type Hit = { end: number; points: number }

// Where part sits in text from a position: as a whole piece, as letters in order, or as a folder or file
// name within a typo or two of it.
function find(part: string, text: string, from: number, typos: boolean): Hit | null {
  const at = text.indexOf(part, from)
  if (at !== -1) return { end: at + part.length, points: 100 }
  let position = from
  let ordered = true
  for (const char of part) {
    const found = text.indexOf(char, position)
    if (found === -1) {
      ordered = false
      break
    }
    position = found + 1
  }
  if (ordered) return { end: position, points: 10 }
  if (!typos || part.length < 4) return null
  const allowed = part.length >= 8 ? 2 : 1
  let start = from
  for (const segment of text.slice(from).split(/[/._-]/)) {
    const index = text.indexOf(segment, start)
    start = index + segment.length
    if (segment && distance(part, segment.slice(0, part.length + 1)) <= allowed) return { end: start, points: 5 }
  }
  return null
}

// A typed path: every piece between slashes or spaces must appear in order, so shop-api/transl
// finds apps/shop-api/src/translations.ts. Whole pieces and a last piece in the file name rank first.
export function pathScore(term: string, path: string, typos = true): number {
  const parts = term
    .toLowerCase()
    .split(/[\s/]+/)
    .filter(Boolean)
  if (!parts.length) return 1
  const hay = path.toLowerCase()
  const nameStart = hay.lastIndexOf('/') + 1
  let from = 0
  let points = 0
  for (const [index, part] of parts.entries()) {
    const hit = find(part, hay, from, typos)
    if (!hit) return 0
    points += hit.points
    if (index === parts.length - 1 && hit.end > nameStart) points += 50
    from = hit.end
  }
  // Shorter paths win ties, so a typed folder lists the files nearest its top first.
  return points - hay.length / 100
}

// Typo matching costs far more than the rest, so it only runs when plain matches leave room in the list.
export function rankPaths(paths: readonly string[], term: string, limit: number): string[] {
  if (!term.trim()) return paths.slice(0, limit)
  const pass = (typos: boolean) =>
    paths
      .map((path) => ({ path, points: pathScore(term, path, typos) }))
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((entry) => entry.path)
  const plain = pass(false)
  return plain.length >= limit ? plain : pass(true)
}
