import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'

export interface Fixture {
  repo: TestRepo
  server: RunningServer
  get(path: string): Promise<Response>
  post(path: string): Promise<Response>
  close(): Promise<void>
}

export async function startFixture(setup: (repo: TestRepo) => void, watch = false): Promise<Fixture> {
  const repo = createRepo()
  setup(repo)
  const server = await createServer({ repo: repo.path, port: 0, watch })
  const headers = { 'x-duck-diff-token': server.token }
  const base = `http://127.0.0.1:${server.port}`
  return {
    repo,
    server,
    get: (path) => fetch(`${base}${path}`, { headers }),
    post: (path) => fetch(`${base}${path}`, { method: 'POST', headers }),
    async close() {
      // On GitHub's macOS runners a test server occasionally stops accepting and its stop never settles.
      await Promise.race([server.stop(), Bun.sleep(2000)])
      repo.cleanup()
    },
  }
}
