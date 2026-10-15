import { describe, expect, it } from 'vitest'
import { blameRef } from '../ref'

describe('blameRef', () => {
  it('blames a commit at itself, a range at its end, local changes in the working file, staged ones not at all', () => {
    expect(blameRef({ kind: 'commit', sha: 'abc' })).toBe('abc')
    expect(blameRef({ kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' })).toBe('feat')
    expect(blameRef({ kind: 'local' })).toBeUndefined()
    expect(blameRef({ kind: 'unstaged' })).toBeUndefined()
    expect(blameRef({ kind: 'staged' })).toBeNull()
  })
})
