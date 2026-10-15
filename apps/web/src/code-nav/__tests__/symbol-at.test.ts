import { describe, expect, it } from 'vitest'
import { refForSide, wordAt } from '../symbol-at'

describe('symbol under the pointer', () => {
  it('reads the identifier around a column and skips keywords, numbers and punctuation', () => {
    const line = 'export const answer$ = compute(42, other_name)'
    expect(wordAt(line, 15)).toBe('answer$')
    expect(wordAt(line, 13)).toBe('answer$')
    expect(wordAt(line, 25)).toBe('compute')
    expect(wordAt(line, 40)).toBe('other_name')
    expect(wordAt(line, 2)).toBeNull()
    expect(wordAt(line, 32)).toBeNull()
    expect(wordAt(line, 21)).toBeNull()
  })

  it('searches each side of a diff at the revision it shows', () => {
    expect(refForSide({ kind: 'local' }, 'additions')).toBeNull()
    expect(refForSide({ kind: 'local' }, 'deletions')).toBe('HEAD')
    expect(refForSide({ kind: 'commit', sha: 'abc' }, 'deletions')).toBe('abc^')
    expect(refForSide({ kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' }, 'additions')).toBe('feat')
  })
})
