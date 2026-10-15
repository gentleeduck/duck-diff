// Fuzzy file search in the way of fzf (Telescope's sorter): the typed letters appear in order, and a match
// scores higher at the start of a path piece, in a run of consecutive letters and inside the file name.

const MATCH = 16
const GAP_START = -3
const GAP_EXTENSION = -1
const BOUNDARY = 8
const DELIMITER = 9
const CAMEL = 7
const CONSECUTIVE = 4
const FIRST_CHAR = 2

export interface FuzzyHit {
  score: number
  // Indexes of the matched characters in the text, for highlighting.
  positions: number[]
}

const isWord = (char: string) => /[a-z0-9]/i.test(char)

// The bonus a match earns at index i for what stands before it.
function bonusAt(text: string, i: number): number {
  if (i === 0) return DELIMITER
  const prev = text[i - 1] ?? ''
  const char = text[i] ?? ''
  if (prev === '/') return DELIMITER
  if (!isWord(prev) && isWord(char)) return BOUNDARY
  if (/[a-z]/.test(prev) && /[A-Z]/.test(char)) return CAMEL
  if (/[^0-9]/.test(prev) && /[0-9]/.test(char)) return CAMEL
  return 0
}

// One query word against a path; null when its letters are not all there in order.
function matchWord(word: string, text: string): FuzzyHit | null {
  // Smart case, as fzf: any capital in what was typed makes the match case-sensitive.
  const sensitive = /[A-Z]/.test(word)
  const hay = sensitive ? text : text.toLowerCase()
  const needle = sensitive ? word : word.toLowerCase()
  const n = needle.length
  const m = hay.length
  if (!n) return { score: 0, positions: [] }
  // Fast reject: not a subsequence at all.
  let probe = 0
  for (let i = 0; i < m && probe < n; i++) if (hay[i] === needle[probe]) probe++
  if (probe < n) return null

  const bonus = Array.from({ length: m }, (_, i) => bonusAt(text, i))
  // best[i][j]: best score with needle[0..i] matched and needle[i] at hay[j]; run[i][j]: consecutive length.
  const best: Float64Array[] = []
  const run: Int32Array[] = []
  const from: Int32Array[] = []
  for (let i = 0; i < n; i++) {
    best.push(new Float64Array(m).fill(Number.NEGATIVE_INFINITY))
    run.push(new Int32Array(m))
    from.push(new Int32Array(m).fill(-1))
  }
  for (let i = 0; i < n; i++) {
    const row = best[i] as Float64Array
    const prevRow = i > 0 ? (best[i - 1] as Float64Array) : null
    // The best score of the previous letter up to j - 1, with the gap since then paid.
    let carried = Number.NEGATIVE_INFINITY
    let carriedAt = -1
    for (let j = i; j < m; j++) {
      if (prevRow && j > 0) {
        const previous = prevRow[j - 1] as number
        const extended = carried + GAP_EXTENSION
        if (previous > extended) {
          carried = previous
          carriedAt = j - 1
        } else {
          carried = extended
        }
      }
      if (hay[j] !== needle[i]) continue
      const own = bonus[j] as number
      if (i === 0) {
        row[j] = MATCH + own * FIRST_CHAR
        continue
      }
      // Either right after the previous letter (a run), or after a gap.
      const adjacent = prevRow?.[j - 1] ?? Number.NEGATIVE_INFINITY
      const runLength = (run[i - 1] as Int32Array)[j - 1] ?? 0
      const viaRun =
        adjacent === Number.NEGATIVE_INFINITY
          ? Number.NEGATIVE_INFINITY
          : adjacent + MATCH + Math.max(own, CONSECUTIVE, runLength > 0 ? CONSECUTIVE : 0)
      const viaGap = carriedAt >= 0 && carriedAt < j - 1 ? carried + GAP_START + MATCH + own : Number.NEGATIVE_INFINITY
      if (viaRun >= viaGap && viaRun > Number.NEGATIVE_INFINITY) {
        row[j] = viaRun
        ;(run[i] as Int32Array)[j] = runLength + 1
        ;(from[i] as Int32Array)[j] = j - 1
      } else if (viaGap > Number.NEGATIVE_INFINITY) {
        row[j] = viaGap
        ;(from[i] as Int32Array)[j] = carriedAt
      }
    }
  }
  const last = best[n - 1] as Float64Array
  let end = -1
  for (let j = 0; j < m; j++) if (end === -1 || (last[j] as number) > (last[end] as number)) end = j
  if (end === -1 || last[end] === Number.NEGATIVE_INFINITY) return null
  const positions: number[] = []
  for (let i = n - 1, j = end; i >= 0 && j >= 0; i--) {
    positions.unshift(j)
    j = (from[i] as Int32Array)[j] ?? -1
  }
  return { score: last[end] as number, positions }
}

// Edits between two words, a swap of neighbours counting as one.
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = rows[i] as number[]
      const up = rows[i - 1] as number[]
      row[j] = Math.min(
        (up[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (up[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j] as number, ((rows[i - 2] as number[])[j - 2] as number) + 1)
    }
  }
  return (rows[a.length] as number[])[b.length] as number
}

// A word with a typo in a folder or file name (shpo-api for shop-api): its slash pieces
// matched in order to path pieces within an edit or two. Scored below any true fuzzy match.
function typoWord(word: string, text: string): FuzzyHit | null {
  const pieces = word.toLowerCase().split('/').filter(Boolean)
  const segments = text.toLowerCase().split('/')
  let at = 0
  let offset = 0
  const starts = segments.map((segment) => {
    const start = offset
    offset += segment.length + 1
    return start
  })
  const positions: number[] = []
  for (const piece of pieces) {
    let found = -1
    for (let k = at; k < segments.length; k++) {
      const segment = segments[k] as string
      const head = segment.slice(0, piece.length)
      const allowed = piece.length >= 8 ? 2 : piece.length >= 4 ? 1 : 0
      if (segment.startsWith(piece) || (allowed && distance(piece, head) <= allowed)) {
        found = k
        break
      }
    }
    if (found === -1) return null
    const start = starts[found] as number
    for (let c = 0; c < Math.min(piece.length, (segments[found] as string).length); c++) positions.push(start + c)
    at = found + 1
  }
  return { score: pieces.length, positions }
}

// Every space-separated word must match; scores add, positions join.
export function fuzzyMatch(query: string, text: string): FuzzyHit | null {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { score: 0, positions: [] }
  let score = 0
  const positions = new Set<number>()
  for (const word of words) {
    const hit = matchWord(word, text) ?? typoWord(word, text)
    if (!hit) return null
    score += hit.score
    for (const position of hit.positions) positions.add(position)
  }
  // Ties go to matches in the file name, then to shorter paths.
  const name = text.lastIndexOf('/') + 1
  const inName = [...positions].filter((position) => position >= name).length
  return { score: score + inName * 2 - text.length / 1000, positions: [...positions].sort((a, b) => a - b) }
}

export interface RankedPath {
  path: string
  positions: number[]
}

export function rankPaths(paths: readonly string[], query: string, limit: number): RankedPath[] {
  if (!query.trim()) return paths.slice(0, limit).map((path) => ({ path, positions: [] }))
  const found: (RankedPath & { score: number })[] = []
  for (const path of paths) {
    const hit = fuzzyMatch(query, path)
    if (hit) found.push({ path, positions: hit.positions, score: hit.score })
  }
  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ path, positions }) => ({ path, positions }))
}
