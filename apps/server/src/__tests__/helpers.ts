import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'

export interface Fixture {
  repo: TestRepo
  server: RunningServer
  get(path: string): Promise<Response>
  post(path: string): Promise<Response>
  close(): Promise<void>
}

// One port per test server for the whole run, below every ephemeral range: macOS hands a just-freed `port: 0` to
// the next listener, and a probe listener still closing took the next server's first connection.
let nextPort = 20_000 + Math.floor(Math.random() * 10_000)
export function testPort(): number {
  return nextPort++
}

export async function startFixture(setup: (repo: TestRepo) => void, watch = false): Promise<Fixture> {
  const repo = createRepo()
  setup(repo)
  const server = await createServer({ repo: repo.path, port: testPort(), watch })
  const headers = { 'x-duck-diff-token': server.token }
  const base = `http://127.0.0.1:${server.port}`
  return {
    repo,
    server,
    get: (path) => fetch(`${base}${path}`, { headers }),
    post: (path) => fetch(`${base}${path}`, { method: 'POST', headers }),
    async close() {
      await server.stop()
      repo.cleanup()
    },
  }
}
