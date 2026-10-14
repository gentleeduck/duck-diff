import { afterEach, describe, expect, it } from 'bun:test'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'

const CLI = new URL('../cli.ts', import.meta.url).pathname

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
  return Bun.spawn(['bun', CLI, 'serve', '--repo', path], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
}

describe('cli', () => {
  it('prints the version', () => {
    const result = Bun.spawnSync(['bun', CLI, '--version'])
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

  it('exits when stdin closes', async () => {
    repo = createRepo()
    child = serve(repo.path)
    await firstLine(child.stdout)
    child.stdin.end()
    expect(await child.exited).toBe(0)
  })

  it('fails with exit code 1 outside a repo', () => {
    const result = Bun.spawnSync(['bun', CLI, 'serve', '--repo', '/'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('not a git repository')
  })
})
