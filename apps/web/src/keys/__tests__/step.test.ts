import { describe, expect, it } from 'vitest'
import { type Position, step } from '../step'

const ITEMS = [
  { id: 'diff:a', hunks: [{ additionStart: 3 }, { additionStart: 40 }] },
  { id: 'diff:b', hunks: [{ additionStart: 1 }] },
  { id: 'diff:c', hunks: [] },
]

describe('step', () => {
  const start: Position = { item: 0, hunk: 0 }
  it('moves through hunks across files and stops at the ends', () => {
    expect(step(ITEMS, start, 'next-hunk')).toEqual({ item: 0, hunk: 1 })
    expect(step(ITEMS, { item: 0, hunk: 1 }, 'next-hunk')).toEqual({ item: 1, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'next-hunk')).toEqual({ item: 1, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'prev-hunk')).toEqual({ item: 0, hunk: 1 })
    expect(step(ITEMS, start, 'prev-hunk')).toEqual(start)
  })

  it('moves by file and lands on its first hunk', () => {
    expect(step(ITEMS, { item: 0, hunk: 1 }, 'next-file')).toEqual({ item: 1, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'next-file')).toEqual({ item: 2, hunk: 0 })
    expect(step(ITEMS, { item: 2, hunk: 0 }, 'next-file')).toEqual({ item: 2, hunk: 0 })
    expect(step(ITEMS, { item: 1, hunk: 0 }, 'prev-file')).toEqual({ item: 0, hunk: 0 })
  })
})
