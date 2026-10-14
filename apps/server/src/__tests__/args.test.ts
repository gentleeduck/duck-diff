import { describe, expect, it } from 'bun:test'
import { parseArgs } from '../args'

describe('parseArgs', () => {
  it('defaults serve to the cwd, a random port and ten minutes idle', () => {
    expect(parseArgs(['serve'], '/work')).toEqual({ name: 'serve', repo: '/work', port: 0, idleTimeoutMs: 600_000 })
  })

  it('reads flags', () => {
    expect(parseArgs(['serve', '--repo', '/r', '--port', '4100', '--idle-timeout-ms', '5000'], '/work')).toEqual({
      name: 'serve',
      repo: '/r',
      port: 4100,
      idleTimeoutMs: 5000,
    })
  })

  it('handles version and help', () => {
    expect(parseArgs(['--version'], '/')).toEqual({ name: 'version' })
    expect(parseArgs([], '/')).toEqual({ name: 'help' })
  })

  it('rejects unknown commands and bad numbers', () => {
    expect(() => parseArgs(['launch'], '/')).toThrow(/usage/i)
    expect(() => parseArgs(['serve', '--port', 'x'], '/')).toThrow(/port/)
  })
})
