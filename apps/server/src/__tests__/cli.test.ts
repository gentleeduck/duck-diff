import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'

const CLI = new URL('../cli.ts', import.meta.url).pathname
// Each run keeps its state in a folder of its own, never the real data folder.
const env = () => {
  const data = mkdtempSync(join(tmpdir(), 'duck-cli-'))
  return { ...process.env, XDG_DATA_HOME: data, DUCK_DIFF_HOME: join(data, 'duck-diff'), BROWSER: 'true' }
}

let repo: TestRepo | null = null
let child: Bun.Subprocess<'pipe', 'pipe', 'pipe'> | null = null
afterEach(() => {
  child?.kill()
  child = null
  repo?.cleanup()
  repo = null
})

async function firstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  let text = ''
  while (!text.includes('\n')) {
    const { value, done } = await reader.read()
    if (done) break
    text += new TextDecoder().decode(value)
  }
  reader.releaseLock()
  return text.split('\n')[0] ?? ''
}

function serve(path: string) {
  return Bun.spawn(['bun', CLI, 'serve', '--repo', path], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: env() })
}

describe('cli', () => {
  it('prints the version', () => {
    const result = Bun.spawnSync(['bun', CLI, '--version'], { env: env() })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('serves and prints exactly one handshake line', async () => {
    repo = createRepo()
    child = serve(repo.path)
    const handshake = HandshakeSchema.parse(JSON.parse(await firstLine(child.stdout)))
    const response = await fetch(`http://127.0.0.1:${handshake.port}/api/repo`, {
      headers: { 'x-duck-diff-token': handshake.token },
    })
    expect(response.status).toBe(200)
  })

  it('started for another checkout, lives as long as the server that started it, not its stdin', async () => {
    repo = createRepo()
    const parent = Bun.spawn(['sleep', '60'])
    const sibling = Bun.spawn(['bun', CLI, 'serve', '--repo', repo.path], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...env(), DUCK_DIFF_PARENT: String(parent.pid) },
    })
    try {
      await firstLine(sibling.stdout)
      // That server restarting in place keeps its pid, so nothing here may end with its pipe.
      await Bun.sleep(1500)
      expect(sibling.exitCode).toBeNull()
      parent.kill()
      expect(await sibling.exited).toBe(0)
    } finally {
      parent.kill()
      sibling.kill()
    }
  })

  it('exits when stdin closes', async () => {
    repo = createRepo()
    child = serve(repo.path)
    await firstLine(child.stdout)
    child.stdin.end()
    expect(await child.exited).toBe(0)
  })

  it('fails with exit code 1 outside a repo', () => {
    const result = Bun.spawnSync(['bun', CLI, 'serve', '--repo', '/'], { env: env() })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('not a git repository')
  })

  it('says a bare repository has no files to show, rather than that it is no repository', () => {
    const bare = mkdtempSync(join(tmpdir(), 'duck-bare-'))
    Bun.spawnSync(['git', 'init', '-q', '--bare', bare])
    const result = Bun.spawnSync(['bun', CLI, 'serve', '--repo', bare], { env: env() })
    rmSync(bare, { recursive: true, force: true })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain(`${bare} is a bare repository; duck-diff needs one with a working tree`)
  })

  it('prints a help page with every command, and one for a command', () => {
    const page = Bun.spawnSync(['bun', CLI, '--help'], { env: env() }).stdout.toString()
    for (const part of ['Usage', 'Targets', 'Views', 'Commands', 'Options', 'Examples', 'prs [<number>]', 'update'])
      expect(page).toContain(part)
    // Not a terminal here, so no colors.
    expect(page).not.toContain('\x1b[')
    expect(Bun.spawnSync(['bun', CLI, 'help', 'serve'], { env: env() }).stdout.toString()).toContain('--nvim <address>')
  })

  it('opens a view, and a second run reuses the server already running for the repo', async () => {
    repo = createRepo()
    const home = env()
    child = Bun.spawn(['bun', CLI, 'graph', '-C', repo.path, '--no-open'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: home,
    })
    const reader = child.stdout.getReader()
    let text = ''
    while (!/token=\w+/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
    reader.releaseLock()
    const url = /(http:\/\/127\.0\.0\.1:\d+\/graph\?token=\w+)/.exec(text)?.[1] ?? ''
    expect(url).not.toBe('')
    expect((await fetch(url)).status).toBe(200)

    const again = Bun.spawnSync(['bun', CLI, 'prs', '12', '-C', repo.path, '--no-open'], { env: home })
    expect(again.exitCode).toBe(0)
    expect(again.stdout.toString().trim()).toBe(url.replace('/graph?', '/prs/12?'))
  })
})
