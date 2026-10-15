import { describe, expect, it } from 'vitest'
import type { DiffLine, DiffRow } from '../../diff/rows'
import { pickedLines, selectedCells } from '../picked-lines'

const line = (kind: DiffLine['kind'], oldNo: number | null, newNo: number | null, text: string): DiffLine => ({
  kind,
  oldNo,
  newNo,
  text,
  hunk: 0,
})

// one, -two, +TWO, three, +four
const stacked: DiffRow[] = [
  { type: 'hunk', index: 0, header: '@@ -1,3 +1,4 @@' },
  { type: 'line', line: line('context', 1, 1, 'one') },
  { type: 'line', line: line('deletion', 2, null, 'two') },
  { type: 'line', line: line('addition', null, 2, 'TWO') },
  { type: 'line', line: line('context', 3, 3, 'three') },
  { type: 'line', line: line('addition', null, 4, 'four') },
]
const split: DiffRow[] = [
  { type: 'pair', left: line('context', 1, 1, 'one'), right: line('context', 1, 1, 'one') },
  { type: 'pair', left: line('deletion', 2, null, 'two'), right: line('addition', null, 2, 'TWO') },
  { type: 'pair', left: line('context', 3, 3, 'three'), right: line('context', 3, 3, 'three') },
  { type: 'pair', left: null, right: line('addition', null, 4, 'four') },
]
const sel = (
  side: 'additions' | 'deletions',
  startLine: number,
  endSide: 'additions' | 'deletions',
  endLine: number,
) => ({ item: 'f', side, startLine, startCol: 0, endSide, endLine, endCol: 1 })

describe('picked lines', () => {
  it('takes every change between the ends of a stacked drag across sides', () => {
    expect(pickedLines(stacked, sel('deletions', 2, 'additions', 2))).toEqual([
      { side: 'old', line: 2, text: 'two' },
      { side: 'new', line: 2, text: 'TWO' },
    ])
    expect(pickedLines(stacked, sel('additions', 1, 'additions', 4)).map((pick) => pick.text)).toEqual([
      'two',
      'TWO',
      'four',
    ])
  })

  it('keeps to one side in a split diff', () => {
    expect(pickedLines(split, sel('additions', 2, 'additions', 4))).toEqual([
      { side: 'new', line: 2, text: 'TWO' },
      { side: 'new', line: 4, text: 'four' },
    ])
    expect(pickedLines(split, sel('deletions', 1, 'deletions', 3))).toEqual([{ side: 'old', line: 2, text: 'two' }])
  })

  it('lists context too for marking the selection', () => {
    expect(selectedCells(stacked, sel('additions', 3, 'additions', 4)).map((cell) => cell.line.text)).toEqual([
      'three',
      'four',
    ])
  })
})
