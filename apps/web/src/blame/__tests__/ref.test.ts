import { describe, expect, it } from 'vitest'
import { blameSides } from '../ref'

describe('blameSides', () => {
  it('blames each side at the version it shows', () => {
    expect(blameSides({ kind: 'commit', sha: 'abc' })).toEqual({ old: { ref: 'abc^' }, new: { ref: 'abc' } })
    expect(blameSides({ kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' })).toEqual({
      old: { ref: 'feat', mergeBase: 'main' },
      new: { ref: 'feat' },
    })
    expect(blameSides({ kind: 'range', from: 'main', to: 'feat', mode: 'two-dot' })).toEqual({
      old: { ref: 'main' },
      new: { ref: 'feat' },
    })
    expect(blameSides({ kind: 'local' })).toEqual({ old: { ref: 'HEAD' }, new: {} })
    expect(blameSides({ kind: 'staged' })).toEqual({ old: { ref: 'HEAD' }, new: null })
  })
})
