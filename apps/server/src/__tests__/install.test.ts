import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = new URL('../../../../install.sh', import.meta.url).pathname
const BINARY = '#!/bin/sh\necho 9.9.9\n'

// The asset install.sh asks for on this machine.
const ASSET = `duck-diff-${process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`

let server: ReturnType<typeof Bun.serve> | undefined
let dir = ''
afterEach(() => {
  server?.stop(true)
  if (dir) rmSync(dir, { recursive: true, force: true })
})

// A stand-in for GitHub's release api: the release, the binary and its checksums.
function fakeGitHub(sum: string) {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url)
      const origin = `http://127.0.0.1:${server?.port}`
      if (pathname === '/repos/duck/test/releases/latest') {
        const release = {
          tag_name: 'v9.9.9',
          assets: [
            { url: `${origin}/repos/duck/test/releases/assets/1`, name: ASSET, size: BINARY.length },
            { url: `${origin}/repos/duck/test/releases/assets/2`, name: 'checksums.txt', size: 80 },
          ],
        }
        return new Response(JSON.stringify(release, null, 2))
      }
      if (pathname === '/repos/duck/test/releases/assets/1') return new Response(BINARY)
      if (pathname === '/repos/duck/test/releases/assets/2') return new Response(`${sum}  ${ASSET}\n`)
      return new Response('not found', { status: 404 })
    },
  })
  return `http://127.0.0.1:${server.port}`
}

// Run apart from this process, which serves the fake GitHub it calls.
async function install(api: string) {
  dir = mkdtempSync(join(tmpdir(), 'duck-diff-install-'))
  const child = Bun.spawn(['sh', SCRIPT, '--dir', join(dir, 'bin')], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, DUCK_DIFF_API: api, DUCK_DIFF_REPO: 'duck/test', GITHUB_TOKEN: 'test', NO_COLOR: '1' },
  })
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { code, out: out + err, bin: join(dir, 'bin', 'duck-diff') }
}

describe('install.sh', () => {
  it('prints the steps the way duck-diff update does, and installs the checked binary', async () => {
    const { code, out, bin } = await install(fakeGitHub(createHash('sha256').update(BINARY).digest('hex')))
    expect(code).toBe(0)
    expect(out).toContain(' 🦆 @gentleduck/diff installer\n──────────────────────────────\n\n')
    // Piped, only results print, one per step.
    expect(out).toContain(`✔ Found 9.9.9\n✔ Downloaded ${BINARY.length} B\n✔ The sha256 matches\n✔ Installed ${bin}\n`)
    expect(out).toContain('  Installed 9.9.9. cd into any git repo and run duck-diff; duck-diff --help shows the rest.')
    expect(readFileSync(bin, 'utf8')).toBe(BINARY)
    expect(statSync(bin).mode & 0o111).not.toBe(0)
  })

  it('installs nothing when the download does not match its checksum', async () => {
    const { code, out, bin } = await install(fakeGitHub('0'.repeat(64)))
    expect(code).toBe(1)
    expect(out).toContain('✖ the download does not match its checksum; nothing was installed')
    expect(existsSync(bin)).toBe(false)
  })
})
