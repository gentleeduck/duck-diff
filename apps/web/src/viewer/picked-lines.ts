import type { DiffLine, DiffRow } from '../diff/rows'
import type { CodeSelection } from './line-selection'

type Side = 'additions' | 'deletions'
export interface PickedLine {
  side: 'old' | 'new'
  line: number
  text: string
}

const sideOf = (line: DiffLine): Side => (line.kind === 'deletion' ? 'deletions' : 'additions')
const numberOf = (line: DiffLine, side: Side) => (side === 'deletions' ? line.oldNo : line.newNo)

// The cells from one end of a selection to the other, in page order. A split diff keeps to the side the
// drag stayed on; a stacked one takes every line between the ends.
export function selectedCells(rows: readonly DiffRow[], selection: CodeSelection): { side: Side; line: DiffLine }[] {
  const both = selection.side !== selection.endSide
  const out: { side: Side; line: DiffLine }[] = []
  let inside = false
  for (const row of rows) {
    const cells: { side: Side; line: DiffLine }[] =
      row.type === 'line'
        ? [{ side: sideOf(row.line), line: row.line }]
        : row.type === 'pair'
          ? [
              ...(row.left ? [{ side: 'deletions' as const, line: row.left }] : []),
              ...(row.right ? [{ side: 'additions' as const, line: row.right }] : []),
            ]
          : []
    const isStart = cells.some(
      (cell) => cell.side === selection.side && numberOf(cell.line, cell.side) === selection.startLine,
    )
    const isEnd = cells.some(
      (cell) => cell.side === selection.endSide && numberOf(cell.line, cell.side) === selection.endLine,
    )
    if (isStart) inside = true
    if (inside) out.push(...cells.filter((cell) => row.type === 'line' || both || cell.side === selection.side))
    if (inside && isEnd) break
  }
  return out
}

// The added and removed lines a selection covers, as the server names them for line staging.
export function pickedLines(rows: readonly DiffRow[], selection: CodeSelection): PickedLine[] {
  return selectedCells(rows, selection).flatMap(({ line }): PickedLine[] => {
    if (line.kind === 'deletion' && line.oldNo !== null)
      return [{ side: 'old' as const, line: line.oldNo, text: line.text }]
    if (line.kind === 'addition' && line.newNo !== null)
      return [{ side: 'new' as const, line: line.newNo, text: line.text }]
    return []
  })
}
