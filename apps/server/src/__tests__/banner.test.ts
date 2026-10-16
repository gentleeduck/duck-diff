import { describe, expect, it } from 'bun:test'
import { startBanner } from '../banner'
import { paintFor } from '../cli-ui'

describe('startBanner', () => {
  const info = { version: '0.5.0', repo: '/code/shop', branch: 'main', url: 'http://127.0.0.1:4000/#t=x' }

  it('names the package, the repo, the branch and the url without color', () => {
    const text = startBanner(info, false)
    expect(text).toContain('🦆 @gentleduck/diff 0.5.0')
    expect(text).toContain('Serving /code/shop on main')
    expect(text).toContain('Open http://127.0.0.1:4000/#t=x')
    expect(text).not.toContain('\x1b[')
  })

  it('underlines the title to its width', () => {
    const [, title, rule] = startBanner(info, false).split('\n')
    expect(rule).toBe('─'.repeat((title as string).length))
  })

  it('leaves the branch out on a detached head', () => {
    expect(startBanner({ ...info, branch: null }, false)).toContain('Serving /code/shop\n')
  })

  it('colors only a terminal that wants it', () => {
    expect(paintFor({ isTTY: true }, {})).toBe(true)
    expect(paintFor({ isTTY: false }, {})).toBe(false)
    expect(paintFor({ isTTY: true }, { NO_COLOR: '1' })).toBe(false)
  })
})
