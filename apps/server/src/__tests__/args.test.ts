import { describe, expect, it } from 'bun:test'
import { parseArgs } from '../args'

describe('parseArgs', () => {
  it('defaults serve to the cwd, a random port and ten minutes idle', () => {
    expect(parseArgs(['serve'], '/work')).toEqual({
      name: 'serve',
      repo: '/work',
      more: [],
      port: 0,
      idleTimeoutMs: 600_000,
      nvim: null,
      terminal: true,
    })
  })

  it('reads flags', () => {
    expect(
      parseArgs(
        ['serve', '--repo', '/r', '--port', '4100', '--idle-timeout-ms', '5000', '--nvim', '/tmp/nvim.sock'],
        '/work',
      ),
    ).toEqual({
      name: 'serve',
      more: [],
      repo: '/r',
      port: 4100,
      idleTimeoutMs: 5000,
      nvim: '/tmp/nvim.sock',
      terminal: true,
    })
  })

  it('reads cache clear, for one repo or every one', () => {
    expect(parseArgs(['cache', 'clear'], '/w')).toEqual({ name: 'cache-clear', repo: null })
    expect(parseArgs(['cache', 'clear', '--repo', 'r'], '/w')).toEqual({ name: 'cache-clear', repo: '/w/r' })
    expect(() => parseArgs(['cache', 'drop'], '/w')).toThrow(/usage/)
  })

  it('turns the page terminals off', () => {
    expect(parseArgs(['serve', '--no-terminal', '--port', '1'], '/w')).toMatchObject({ port: 1, terminal: false })
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
