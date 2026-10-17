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

  it('never opens a terminal: with Neovim installed but not attached, VS Code takes the file', () => {
    expect(pickOpener({ nvim: null, which: has('nvim', 'code'), platform: 'linux' })).toMatchObject({
      how: 'editor',
      command: 'code',
    })
  })

  it('finds VS Code inside its macOS app when code is not on the PATH', () => {
    const app = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    const opener = pickOpener({ nvim: null, which: has('zed'), platform: 'darwin', exists: (path) => path === app })
    expect(opener).toMatchObject({ how: 'editor', command: app })
    expect(opener.how === 'editor' && opener.args('/r/a.ts', 4)).toEqual(['-g', '/r/a.ts:4'])
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
    expect(pickOpener({ nvim: null, which: has(), platform: 'darwin', exists: () => false })).toMatchObject({
      how: 'system',
      command: 'open',
    })
    expect(pickOpener({ nvim: null, which: has(), platform: 'linux' })).toMatchObject({
      how: 'system',
      command: 'xdg-open',
    })
  })
})
