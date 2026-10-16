import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { parseArgs } from '../args'
import { createRepoList } from '../repos'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

const made: TestRepo[] = []
let data = ''
let server: RunningServer | undefined
afterEach(async () => {
  await server?.stop()
  server = undefined
  for (const repo of made.splice(0)) repo.cleanup()
  if (data) rmSync(data, { recursive: true, force: true })
})
const repo = () => {
  const made1 = createRepo()
  made.push(made1)
  return made1
}

describe('repo list', () => {
  it('keeps the most recent first, once each, and survives a restart', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    const [a, b] = [repo(), repo()]
    const list = createRepoList(data)
    await list.add(a.path)
    await list.add(b.path)
    await list.add(a.path)
    expect((await list.all()).map((entry) => entry.path)).toEqual([a.path, b.path])
    expect((await createRepoList(data).all())[0]).toEqual({ path: a.path, name: a.path.split('/').pop() ?? '' })
    await list.remove(b.path)
    expect((await list.all()).map((entry) => entry.path)).toEqual([a.path])
  })

  it('leaves out and forgets a repo whose folder is gone, so it frees its place in the list', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    const [kept, gone] = [repo(), repo()]
    const list = createRepoList(data)
    await list.add(kept.path)
    await list.add(gone.path)
    gone.cleanup()
    expect((await list.all()).map((entry) => entry.path)).toEqual([kept.path])
    expect(JSON.parse(readFileSync(join(data, 'duck-diff', 'repos.json'), 'utf8'))).toEqual([kept.path])
  })

  it("keeps test servers out of the user's own list", () => {
    expect(process.env.XDG_DATA_HOME?.startsWith(tmpdir())).toBe(true)
  })

  it('refuses a folder that is not a repository', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    await expect(createRepoList(data).add(data)).rejects.toThrow()
  })
})

describe('repeated --repo', () => {
  it('serves the first and remembers the rest', () => {
    expect(parseArgs(['serve', '--repo', 'a', '--repo', '/b'], '/w')).toMatchObject({ repo: '/w/a', more: ['/b'] })
  })
})

describe('/api/repos', () => {
  it('lists this repo and the others, adds one, and opens any listed one in its own server', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    const [here, other, third] = [repo(), repo(), repo()]
    const opened: string[] = []
    server = await createServer({
      repo: here.path,
      port: testPort(),
      watch: false,
      dataDir: data,
      repos: [other.path],
      startSibling: async (path) => {
        opened.push(path)
        return { url: 'http://127.0.0.1:1/', child: null }
      },
    })
    const call = (method: string, path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${server?.port}${path}`, {
        method,
        headers: { 'x-duck-diff-token': server?.token ?? '', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    const listed = await (await call('GET', '/api/repos')).json()
    expect(listed.map((entry: { path: string; current: boolean }) => [entry.path, entry.current])).toEqual([
      [here.path, true],
      [other.path, false],
    ])
    expect((await call('POST', '/api/repos', { path: third.path })).status).toBe(200)
    expect((await call('POST', '/api/open-repo', { path: third.path })).status).toBe(200)
    expect(opened).toEqual([third.path])
    expect((await call('POST', '/api/repos', { path: data })).status).toBeGreaterThanOrEqual(400)
  })

  it('still lists the repo being served after other servers pushed it out of the list', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    const here = repo()
    server = await createServer({ repo: here.path, port: testPort(), watch: false, dataDir: data })
    await createRepoList(data).remove(here.path)
    const listed = await (
      await fetch(`http://127.0.0.1:${server.port}/api/repos`, { headers: { 'x-duck-diff-token': server.token } })
    ).json()
    expect(listed).toEqual([{ path: here.path, name: here.path.split('/').pop(), current: true }])
  })
})
