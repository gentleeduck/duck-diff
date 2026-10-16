import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReporter } from '../cli-ui'
import { browserCommand, instanceFile, liveInstance, pageUrl, removeInstance, writeInstance } from '../instance'
import { assetName, checksumFor, update } from '../update'

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

// GitHub's release API for one repo: the release, this machine's binary and its checksums.
function fakeGitHub(tag: string, binary: string, sum = new Bun.CryptoHasher('sha256').update(binary).digest('hex')) {
  let base = ''
  const server = Bun.serve({
    port: 0,
    fetch(request): Response {
      const path = new URL(request.url).pathname
      if (path === '/repos/o/r/releases/latest')
        return Response.json({
          tag_name: tag,
          assets: [
            { name: assetName(), url: `${base}/assets/1`, size: binary.length },
            { name: 'checksums.txt', url: `${base}/assets/2`, size: 80 },
          ],
        })
      if (path === '/assets/1') return new Response(binary)
      if (path === '/assets/2') return new Response(`${sum}  ${assetName()}\n`)
      return new Response('missing', { status: 404 })
    },
  })
  base = `http://127.0.0.1:${server.port}`
  return server
}

describe('updating', () => {
  const run = async (tag: string, sum?: string) => {
    data = mkdtempSync(join(tmpdir(), 'duck-update-'))
    const binary = join(data, 'duck-diff')
    writeFileSync(binary, 'old')
    const github = fakeGitHub(tag, 'new build', sum)
    let text = ''
    const out = {
      write: (chunk: string) => {
        text += chunk
      },
    }
    const report = createReporter({ out, color: false, live: false })
    const ok = await update({
      binary,
      current: '0.5.1',
      wanted: null,
      report,
      api: `http://127.0.0.1:${github.port}`,
      repo: 'o/r',
      auth: null,
    })
    github.stop(true)
    return { ok, text, binary }
  }

  it('finds, downloads, checks and installs a newer release, saying each step', async () => {
    const { ok, text, binary } = await run('v9.9.9')
    expect(ok).toBe(true)
    expect(readFileSync(binary, 'utf8')).toBe('new build')
    expect(statSync(binary).mode & 0o111).toBeTruthy()
    expect(text).toBe(
      [
        '✔ Found 9.9.9 (you have 0.5.1)',
        '✔ Downloaded 9 B',
        '✔ The sha256 matches',
        `✔ Installed ${binary}`,
        '',
        '  Updated 0.5.1 to 9.9.9. Servers already running switch to it on their own.',
        '',
      ].join('\n'),
    )
  })

  it('says so when this is already the newest release, and changes nothing', async () => {
    const { ok, text, binary } = await run('v0.5.1')
    expect(ok).toBe(true)
    expect(text).toBe('✔ Already on 0.5.1, the newest release\n')
    expect(readFileSync(binary, 'utf8')).toBe('old')
  })

  it('refuses a download that does not match its checksum and keeps the old binary', async () => {
    const { ok, text, binary } = await run('v9.9.9', '0'.repeat(64))
    expect(ok).toBe(false)
    expect(text).toContain('✖ the download does not match its checksum; nothing changed')
    expect(readFileSync(binary, 'utf8')).toBe('old')
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
