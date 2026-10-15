import { describe, expect, it } from 'bun:test'
import { applyEdits, suggestionLines } from '../suggestions'

describe('suggestions', () => {
  it('reads the lines of a suggestion block, and none from a plain comment', () => {
    expect(suggestionLines('Try:\n```suggestion\nconst a = 1\nconst b = 2\n```\nthanks')).toEqual([
      'const a = 1',
      'const b = 2',
    ])
    expect(suggestionLines('```suggestion\n```')).toEqual([])
    expect(suggestionLines('```suggestion\r\nx\r\n```')).toEqual(['x'])
    expect(suggestionLines('looks fine')).toBeNull()
  })

  it('applies edits bottom up and keeps CRLF files CRLF', () => {
    expect(
      applyEdits('a\nb\nc\nd\n', [
        { start: 1, end: 1, lines: ['A'] },
        { start: 3, end: 4, lines: [] },
      ]),
    ).toBe('A\nb\n')
    expect(applyEdits('a\r\nb\r\n', [{ start: 2, end: 2, lines: ['B', 'C'] }])).toBe('a\r\nB\r\nC\r\n')
  })

  it('refuses overlapping edits and lines past the end', () => {
    expect(() =>
      applyEdits('a\nb\nc', [
        { start: 1, end: 2, lines: [] },
        { start: 2, end: 3, lines: [] },
      ]),
    ).toThrow('same lines')
    expect(() => applyEdits('a', [{ start: 3, end: 3, lines: [] }])).toThrow('past the end')
  })
})
