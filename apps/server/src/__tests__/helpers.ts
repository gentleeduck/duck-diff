import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'

export interface Fixture {
  repo: TestRepo
  server: RunningServer
  get(path: string): Promise<Response>
  post(path: string): Promise<Response>
  close(): Promise<void>
}

// macOS hands a just-freed port to the next `port: 0` listener, and a client still holding a socket to the old
// server then sees resets. Each test server gets its own port for the whole run instead.
let nextPort = 20_000 + Math.floor(Math.random() * 30_000)
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
