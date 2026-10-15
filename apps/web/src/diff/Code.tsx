import type { CSSProperties, ReactNode } from 'react'
import type { Token } from './highlight'
import type { Range } from './words'

// tokyo-night's shades by role, so a theme recolors code through CSS variables without highlighting again.
const ROLES: Record<string, string> = {
  '#bb9af7': 'var(--syn-keyword)',
  '#c0caf5': 'var(--syn-text)',
  '#f7768e': 'var(--syn-tag)',
  '#7aa2f7': 'var(--syn-function)',
  '#0db9d7': 'var(--syn-type)',
  '#2ac3de': 'var(--syn-type)',
  '#e0af68': 'var(--syn-class)',
  '#7dcfff': 'var(--syn-property)',
  '#73daca': 'var(--syn-key)',
  '#89ddff': 'var(--syn-operator)',
  '#9ece6a': 'var(--syn-string)',
  '#9abdf5': 'var(--syn-param)',
  '#9aa5ce': 'var(--syn-param)',
  '#ff9e64': 'var(--syn-number)',
  '#9d7cd8': 'var(--syn-special)',
  '#565f89': 'var(--syn-comment)',
  '#51597d': 'var(--syn-comment)',
  '#5a638c': 'var(--syn-comment)',
}
const role = (color: string) => ROLES[color.toLowerCase()] ?? color

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
          className={color ? 'tok' : undefined}
          style={
            {
              '--tok': color ? role(color) : undefined,
              textDecoration: style & 4 ? 'underline' : undefined,
            } as CSSProperties
          }>
          {content.slice(from - at, to - at)}
        </span>,
      )
    }
    at = end
  }
  return <>{out}</>
}
