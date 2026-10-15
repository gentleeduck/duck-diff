import { memo } from 'react'
import type { GraphRow, Segment } from './layout'

export const LANE_WIDTH = 16
// A filled dot for a commit, a ring around a dot for a merge, a wider hollow ring for HEAD.
const DOT = 5
const RING = 5
const HEAD = 6.5
// One weight for lanes and rings, so the graph reads as one stroke like the UI's bold type.
const LINE = 3

// Lane colors from the terminal's palette, in the order new branches pick them.
const COLORS = [
  'var(--tn-blue)',
  'var(--tn-magenta)',
  'var(--tn-green)',
  'var(--tn-orange)',
  'var(--tn-cyan)',
  'var(--tn-red)',
  'var(--tn-yellow)',
  'var(--tn-teal)',
]

export const laneColor = (color: number) => COLORS[color % COLORS.length] ?? COLORS[0]

const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2

function path({ from, to }: Segment, height: number): string {
  const [x1, y1, x2, y2] = [x(from[0]), from[1] * height, x(to[0]), to[1] * height]
  if (x1 === x2) return `M${x1} ${y1}V${y2}`
  // Lanes that join or leave bend smoothly instead of cutting diagonally across the row.
  const middle = (y1 + y2) / 2
  return `M${x1} ${y1}C${x1} ${middle} ${x2} ${middle} ${x2} ${y2}`
}

export const GraphLines = memo(function GraphLines({
  row,
  lanes,
  height,
  merge,
  head,
}: {
  row: GraphRow
  lanes: number
  height: number
  merge: boolean
  head: boolean
}) {
  const width = lanes * LANE_WIDTH
  const dot = laneColor(row.color)
  const cx = x(row.lane)
  const cy = height / 2
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden>
      {row.segments.map((segment, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: a row's segments never reorder
          key={i}
          d={path(segment, height)}
          fill="none"
          stroke={laneColor(segment.color)}
          strokeWidth={LINE}
          strokeLinecap="round"
        />
      ))}
      {head ? (
        <circle cx={cx} cy={cy} r={HEAD} fill="var(--background)" stroke={dot} strokeWidth={LINE} />
      ) : merge ? (
        <>
          <circle cx={cx} cy={cy} r={RING} fill="var(--background)" stroke={dot} strokeWidth={LINE * 0.8} />
          <circle cx={cx} cy={cy} r={2} fill={dot} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={DOT} fill={dot} />
      )}
    </svg>
  )
})
