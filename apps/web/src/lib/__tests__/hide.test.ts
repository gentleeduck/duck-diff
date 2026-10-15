import { describe, expect, it } from 'vitest'
import { compileHidden, DEFAULT_HIDE, validPattern } from '../hide'

describe('hide patterns', () => {
  it('hides test files with the default pattern once it is on', () => {
    expect(compileHidden(DEFAULT_HIDE)('src/__tests__/a.test.ts')).toBe(false)
    const on = DEFAULT_HIDE.map((entry) => ({ ...entry, enabled: true }))
    const hidden = compileHidden(on)
    expect(hidden('src/__tests__/a.ts')).toBe(true)
    expect(hidden('src/app.spec.tsx')).toBe(true)
    expect(hidden('pkg/foo_test.go')).toBe(true)
    expect(hidden('src/app.ts')).toBe(false)
  })

  it('adds the user patterns and skips ones that do not compile', () => {
    const hidden = compileHidden([
      { id: 'a', label: 'Snapshots', pattern: '\\.snap$', enabled: true },
      { id: 'b', label: 'Broken', pattern: '(', enabled: true },
      { id: 'c', label: 'Off', pattern: 'lock', enabled: false },
    ])
    expect(hidden('src/__snapshots__/a.snap')).toBe(true)
    expect(hidden('bun.lock')).toBe(false)
    expect(validPattern('(')).toBe(false)
    expect(validPattern('\\.lock$')).toBe(true)
  })
})
