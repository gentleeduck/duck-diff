import { describe, expect, it } from 'bun:test'
import { pickOpener } from '../editor'

const has =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name) ? `/usr/bin/${name}` : null

describe('opening a file', () => {
  it('uses the Neovim the server was started from, first of all', () => {
    expect(pickOpener({ nvim: '/tmp/nvim.sock', which: has('code', 'nvim'), platform: 'linux' })).toEqual({
      how: 'nvim',
    })
  })

  it('opens Neovim in a terminal in the page when it is installed', () => {
    expect(pickOpener({ nvim: null, which: has('nvim', 'code'), platform: 'linux' })).toEqual({ how: 'terminal' })
  })

  it('falls back to a code editor, VS Code first', () => {
    expect(pickOpener({ nvim: null, which: has('zed', 'code'), platform: 'linux' })).toMatchObject({
      how: 'editor',
      command: 'code',
    })
    expect(pickOpener({ nvim: null, which: has('zed'), platform: 'linux' })).toMatchObject({
      how: 'editor',
      command: 'zed',
    })
  })

  it('opens with the system when nothing else is there', () => {
    expect(pickOpener({ nvim: null, which: has(), platform: 'darwin' })).toMatchObject({
      how: 'system',
      command: 'open',
    })
    expect(pickOpener({ nvim: null, which: has(), platform: 'linux' })).toMatchObject({
      how: 'system',
      command: 'xdg-open',
    })
  })
})
