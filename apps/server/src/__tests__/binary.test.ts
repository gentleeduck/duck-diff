import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo } from '@duck-diff/testing'
import { WEB_ASSETS } from '../web-assets.gen'

const BINARY = new URL('../../dist/duck-diff', import.meta.url).pathname

// Only meaningful after `bun run build`; `ci` builds first, a bare `bun test` skips it.
describe.skipIf(!existsSync(BINARY))('compiled binary', () => {
  it('prints its version and serves the embedded app', async () => {
    expect(Bun.spawnSync([BINARY, '--version']).stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+$/)

    const repo = createRepo()
    const child = Bun.spawn([BINARY, 'serve', '--repo', repo.path], { stdin: 'pipe', stdout: 'pipe' })
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
  })
})
