import { encodeTarget } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TARGET, readTarget, writeTarget } from '../target-url'

describe('target url', () => {
  it('defaults to local changes', () => {
    expect(readTarget('')).toEqual(DEFAULT_TARGET)
    expect(readTarget('?target=garbage')).toEqual(DEFAULT_TARGET)
  })

  it('round-trips and keeps other params', () => {
    const target = { kind: 'range', from: 'main', to: 'feat/x', mode: 'merge-base' } as const
    const search = writeTarget(target, '?token=abc')
    expect(search).toContain('token=abc')
    expect(new URLSearchParams(search).get('target')).toBe(decodeURIComponent(encodeTarget(target)))
    expect(readTarget(search)).toEqual(target)
  })
})
