import { describe, expect, it } from 'vitest'
import { changedRanges } from '../words'

describe('changedRanges', () => {
  it('marks the words that differ on each side', () => {
    expect(changedRanges('const answer = 41', 'const answer = 42', 'word')).toEqual({
      old: [[15, 17]],
      new: [[15, 17]],
    })
  })

  it('marks single characters in character mode', () => {
    expect(changedRanges('const answer = 41', 'const answer = 42', 'char')).toEqual({
      old: [[16, 17]],
      new: [[16, 17]],
    })
  })

  it('skips lines that share too little to be worth marking, and very long lines', () => {
    expect(changedRanges('alpha beta', 'gamma delta', 'word')).toEqual({ old: [], new: [] })
    expect(changedRanges('a'.repeat(3000), 'b'.repeat(3000), 'char')).toEqual({ old: [], new: [] })
  })
})
