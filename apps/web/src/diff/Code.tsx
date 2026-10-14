import type { ReactNode } from 'react'
import type { Token } from './highlight'
import type { Range } from './words'

// Splits the line at token and changed-word boundaries so each piece gets its own color and mark.
export function Code({ text, tokens, marks }: { text: string; tokens?: Token[]; marks?: Range[] }) {
  const pieces: Token[] = tokens?.length ? tokens : [[text, '', 0]]
  const out: ReactNode[] = []
  let at = 0
  for (const [i, [content, color, style]] of pieces.entries()) {
    const end = at + content.length
    const cuts = new Set([at, end])
    for (const [from, to] of marks ?? []) {
      if (from > at && from < end) cuts.add(from)
      if (to > at && to < end) cuts.add(to)
    }
    const points = [...cuts].sort((a, b) => a - b)
    for (let p = 0; p < points.length - 1; p++) {
      const from = points[p] ?? 0
      const to = points[p + 1] ?? 0
      const marked = marks?.some(([start, stop]) => from >= start && to <= stop)
      out.push(
        <span
          key={`${i}:${from}`}
          data-mark={marked || undefined}
          style={{ color: color || undefined, textDecoration: style & 4 ? 'underline' : undefined }}>
          {content.slice(from - at, to - at)}
        </span>,
      )
    }
    at = end
  }
  return <>{out}</>
}
