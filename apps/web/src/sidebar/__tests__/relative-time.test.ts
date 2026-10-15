import { describe, expect, it } from 'vitest'
import { shortAge } from '../relative-time'

describe('shortAge', () => {
  it('fits an age in a few characters, for narrow columns', () => {
    const now = 1_000_000_000
    expect(shortAge(now - 10, now)).toBe('now')
    expect(shortAge(now - 5 * 60, now)).toBe('5m')
    expect(shortAge(now - 3 * 3600, now)).toBe('3h')
    expect(shortAge(now - 22 * 86400, now)).toBe('22d')
    expect(shortAge(now - 70 * 86400, now)).toBe('2mo')
    expect(shortAge(now - 800 * 86400, now)).toBe('2y')
  })
})
