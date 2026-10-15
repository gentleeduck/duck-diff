import { getFiletypeFromFileName } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { fencePath } from '../fence'

describe('fencePath', () => {
  it('maps fence names, long and short, to a file the highlighter knows', () => {
    expect(getFiletypeFromFileName(fencePath('typescript'))).toBe('typescript')
    expect(getFiletypeFromFileName(fencePath('ts'))).toBe('typescript')
    expect(getFiletypeFromFileName(fencePath('javascript'))).toBe('javascript')
    expect(getFiletypeFromFileName(fencePath('rust'))).toBe('rust')
    expect(getFiletypeFromFileName(fencePath('python'))).toBe('python')
    expect(getFiletypeFromFileName(fencePath('shell'))).toBe('zsh')
    expect(getFiletypeFromFileName(fencePath('go'))).toBe('go')
  })
})
