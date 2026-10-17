import { describe, expect, it } from 'bun:test'
import { copyFileSync, existsSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo } from '@duck-diff/testing'
import { WEB_ASSETS } from '../web-assets.gen'

const BINARY = new URL('../../dist/duck-diff', import.meta.url).pathname

// Only meaningful after `bun run build`; `ci` builds first, a bare `bun test` skips it.
describe.skipIf(!existsSync(BINARY))('compiled binary', () => {
  it('prints its version and serves the embedded app', async () => {
    expect(Bun.spawnSync([BINARY, '--version'], { env: process.env }).stdout.toString().trim()).toMatch(
      /^\d+\.\d+\.\d+$/,
    )

    const repo = createRepo()
    // A repo whose bunfig preloads a missing module must not stop the server from starting there.
    repo.write('bunfig.toml', 'preload = ["./missing-preload.ts"]\n')
    const child = Bun.spawn([BINARY, 'serve', '--repo', repo.path], {
      cwd: repo.path,
      env: process.env,
      stdin: 'pipe',
      stdout: 'pipe',
    })
    const reader = child.stdout.getReader()
    const { value } = await reader.read()
    const handshake = HandshakeSchema.parse(JSON.parse(new TextDecoder().decode(value).split('\n')[0] ?? ''))
    const page = await fetch(handshake.url)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('duck-diff')
    // With a web build embedded, the binary must serve the real app rather than the placeholder.
    if (Object.keys(WEB_ASSETS).some((path) => path.startsWith('/assets/'))) expect(html).toContain('id="root"')
    child.kill()
    repo.cleanup()
    // macOS scans a freshly built, unsigned binary on its first launch, which can take several seconds on CI.
  }, 30_000)

  it('keeps the server it started for a worktree when a new build takes over, on the same port', async () => {
    const repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.commit('base')
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'duck-diff-handover-')))
    const tree = join(outside, 'tree')
    repo.git('worktree', 'add', '-q', '-b', 'side', tree)
    // A private copy, so installing over it stands in for a new build.
    const bin = join(outside, 'duck-diff')
    copyFileSync(BINARY, bin)
    const child = Bun.spawn([bin, 'serve', '--repo', repo.path], { stdin: 'pipe', stdout: 'pipe', env: process.env })
    const ask = (origin: string, token: string, path: string, init?: RequestInit) =>
      fetch(`${origin}${path}`, {
        ...init,
        headers: { 'x-duck-diff-token': token, 'content-type': 'application/json' },
      })
    try {
      const reader = child.stdout.getReader()
      const { value } = await reader.read()
      const main = HandshakeSchema.parse(JSON.parse(new TextDecoder().decode(value).split('\n')[0] ?? ''))
      const origin = `http://127.0.0.1:${main.port}`
      const build = async () =>
        (
          (await ask(origin, main.token, '/api/repo').then(
            (r) => r.json(),
            () => null,
          )) as { build?: string } | null
        )?.build
      const opened = (await (
        await ask(origin, main.token, '/api/open-repo', { method: 'POST', body: JSON.stringify({ path: tree }) })
      ).json()) as { url: string }
      const sibling = new URL(opened.url)
      const token = sibling.searchParams.get('token') ?? ''
      const answers = () =>
        ask(sibling.origin, token, '/api/repo').then(
          (r) => r.ok,
          () => false,
        )
      expect(await answers()).toBe(true)

      const before = await build()
      copyFileSync(BINARY, `${bin}.new`)
      renameSync(`${bin}.new`, bin)
      const until = async (check: () => Promise<boolean>) => {
        for (let i = 0; i < 60 && !(await check()); i++) await Bun.sleep(250)
      }
      await until(async () => {
        const now = await build()
        return now !== undefined && now !== before
      })
      expect(await build()).not.toBe(before)
      // The worktree's server restarts on the new build too, and stays: its page reloads instead of dying.
      await until(answers)
      await Bun.sleep(2000)
      expect(await answers()).toBe(true)
    } finally {
      child.kill()
      await child.exited
      repo.cleanup()
      rmSync(outside, { recursive: true, force: true })
    }
  }, 60_000)
})
