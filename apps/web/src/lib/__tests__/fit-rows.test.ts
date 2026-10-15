import { describe, expect, it } from 'vitest'
import { fitRows } from '../fit-rows'

describe('fitRows', () => {
  it('keeps the minimum for short text, grows with lines and long lines, and stops at the maximum', () => {
    expect(fitRows('', 4)).toBe(4)
    expect(fitRows('a\nb\nc\nd\ne\nf', 4)).toBe(7)
    expect(fitRows('x'.repeat(250), 2)).toBe(4)
    expect(fitRows('a\n'.repeat(100), 4)).toBe(28)
  })
})
