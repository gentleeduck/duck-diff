import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browserCommand, instanceFile, liveInstance, pageUrl, removeInstance, writeInstance } from '../instance'
import { assetName, checksumFor } from '../update'

let data: string | null = null
afterEach(() => {
  if (data) rmSync(data, { recursive: true, force: true })
  data = null
})

describe('update', () => {
  it('names the release asset for each machine it is built for', () => {
    expect(assetName('linux', 'x64')).toBe('duck-diff-linux-x64')
    expect(assetName('darwin', 'arm64')).toBe('duck-diff-darwin-arm64')
    expect(() => assetName('win32', 'x64')).toThrow(/no duck-diff build/)
  })

  it('finds an asset in sha256sum output, star-marked or not', () => {
    const sums = 'aa11  duck-diff-linux-x64\nBB22 *duck-diff-darwin-arm64\n'
    expect(checksumFor(sums, 'duck-diff-linux-x64')).toBe('aa11')
    expect(checksumFor(sums, 'duck-diff-darwin-arm64')).toBe('bb22')
    expect(checksumFor(sums, 'duck-diff-linux-arm64')).toBeNull()
  })
})

describe('running instance', () => {
  it('forgets a server that is gone, and only removes its own record', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-instance-'))
    const file = instanceFile(data, '/repo')
    // A pid no process has.
    await writeInstance(file, { pid: 2 ** 22 + 17, port: 1, token: 't' })
    expect(await liveInstance(file)).toBeNull()
    await removeInstance(file, 1)
    expect(await Bun.file(file).exists()).toBe(true)
    await removeInstance(file, 2 ** 22 + 17)
    expect(await Bun.file(file).exists()).toBe(false)
  })

  it('builds page links with the token after any query', () => {
    expect(pageUrl({ port: 4, token: 'k' }, '/graph')).toBe('http://127.0.0.1:4/graph?token=k')
    expect(pageUrl({ port: 4, token: 'k' }, '/files?file=a')).toBe('http://127.0.0.1:4/files?file=a&token=k')
  })
})

describe('opening the page', () => {
  const has =
    (...names: string[]) =>
    (name: string) =>
      names.includes(name) ? `/usr/bin/${name}` : null
  it('opens an app window in a Chromium browser, like the Neovim plugin, and the default browser otherwise', () => {
    expect(
      browserCommand('http://x', { which: has('chromium', 'brave'), platform: 'linux', browser: undefined }),
    ).toEqual(['chromium', '--app=http://x'])
    expect(browserCommand('http://x', { which: has(), platform: 'linux', browser: undefined })).toEqual([
      'xdg-open',
      'http://x',
    ])
    expect(browserCommand('http://x', { which: has('chromium'), platform: 'linux', browser: 'firefox' })).toEqual([
      'firefox',
      'http://x',
    ])
  })
})
