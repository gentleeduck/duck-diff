import { describe, expect, it } from 'bun:test'
import { openKeys } from '../nvim'

describe('openKeys', () => {
  it('opens the file at the line from any mode', () => {
    expect(openKeys('/repo/src/a.ts', 12)).toBe('<C-\\><C-n>:edit +12 /repo/src/a.ts<CR>')
  })

  it('escapes characters the command line would read specially', () => {
    expect(openKeys('/repo/my file#1%.ts', 1)).toBe('<C-\\><C-n>:edit +1 /repo/my\\ file\\#1\\%.ts<CR>')
  })

  it('keeps the line at 1 or more', () => {
    expect(openKeys('/r/a', 0)).toContain('+1 ')
  })
})
