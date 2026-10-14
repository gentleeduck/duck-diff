import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'

export interface Fixture {
  repo: TestRepo
  server: RunningServer
  get(path: string): Promise<Response>
  post(path: string): Promise<Response>
  close(): Promise<void>
}

// GitHub's macOS runners sometimes refuse a connection to a live test server for a moment and then hang its
// stop; one short retry and a bounded stop keep that runner quirk from failing unrelated tests.
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if ((error as { code?: string }).code !== 'ConnectionRefused') throw error
    await Bun.sleep(200)
    return fetch(url, init)
  }
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
    get: (path) => request(`${base}${path}`, { headers }),
    post: (path) => request(`${base}${path}`, { method: 'POST', headers }),
    async close() {
      await Promise.race([server.stop(), Bun.sleep(2000)])
      repo.cleanup()
    },
  }
}
