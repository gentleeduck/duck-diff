import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerEvent } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo
let server: RunningServer
let data: string
afterEach(async () => {
  await server?.stop()
  repo.cleanup()
  rmSync(data, { recursive: true, force: true })
})

async function start() {
  server = await createServer({ repo: repo.path, port: testPort(), watch: false, dataDir: data })
}

async function setup() {
  repo = createRepo()
  repo.write('a.txt', 'one\n')
  repo.commit('base')
  data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
  await start()
}

function call(method: string, path: string, body?: unknown) {
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const UNSTAGED = encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))
const draft = {
  target: { kind: 'unstaged' },
  path: 'a.txt',
  side: 'additions',
  line: 1,
  lineHash: 'abc',
  body: 'needs a test',
}

describe('/api/reviews', () => {
  it('gives one comment, or every comment on the comparison, as a prompt to paste into an AI', async () => {
    await setup()
    const first = await (await call('POST', '/api/reviews', draft)).json()
    await call('POST', '/api/reviews', { ...draft, body: 'and a second one' })
    const one = await call('GET', `/api/reviews/prompt?target=${UNSTAGED}&id=${first.id}`)
    expect(one.headers.get('content-type')).toContain('text/plain')
    const text = await one.text()
    expect(text).toContain('## a.txt, line 1 (new)')
    expect(text).toContain('needs a test')
    expect(text).not.toContain('and a second one')
    const all = await (await call('GET', `/api/reviews/prompt?target=${UNSTAGED}`)).text()
    expect(all).toContain('needs a test')
    expect(all).toContain('and a second one')
    expect((await call('GET', `/api/reviews/prompt?target=${UNSTAGED}&id=nope`)).status).toBe(404)
  })

  it('creates a comment and lists it for its target only', async () => {
    await setup()
    const created = await call('POST', '/api/reviews', draft)
    expect(created.status).toBe(201)
    const comment = await created.json()
    expect(comment).toMatchObject({ ...draft, id: expect.any(String) })
    expect(await (await call('GET', `/api/reviews?target=${UNSTAGED}`)).json()).toEqual([comment])
    const staged = encodeURIComponent(JSON.stringify({ kind: 'staged' }))
    expect(await (await call('GET', `/api/reviews?target=${staged}`)).json()).toEqual([])
  })

  it('edits and deletes, and answers 404 for unknown ids', async () => {
    await setup()
    const { id } = await (await call('POST', '/api/reviews', draft)).json()
    const edited = await call('PATCH', `/api/reviews/${id}`, { body: 'needs two tests' })
    expect(edited.status).toBe(200)
    expect((await edited.json()).body).toBe('needs two tests')
    expect((await call('DELETE', `/api/reviews/${id}`)).status).toBe(204)
    expect(await (await call('GET', `/api/reviews?target=${UNSTAGED}`)).json()).toEqual([])
    expect((await call('DELETE', `/api/reviews/${id}`)).status).toBe(404)
    expect((await call('PATCH', '/api/reviews/nope', { body: 'x' })).status).toBe(404)
  })

  it('keeps comments across restarts and outside the repo', async () => {
    await setup()
    await call('POST', '/api/reviews', draft)
    await server.stop()
    await start()
    expect(await (await call('GET', `/api/reviews?target=${UNSTAGED}`)).json()).toHaveLength(1)
    expect(repo.git('status', '--porcelain')).toBe('')
  })

  it('refuses a bad body', async () => {
    await setup()
    expect((await call('POST', '/api/reviews', { ...draft, body: '' })).status).toBe(400)
    expect((await call('POST', '/api/reviews', { ...draft, path: '../etc/passwd' })).status).toBe(400)
  })

  it('applies concurrent creates without losing one', async () => {
    await setup()
    await Promise.all([1, 2, 3, 4, 5].map((line) => call('POST', '/api/reviews', { ...draft, line })))
    expect(await (await call('GET', `/api/reviews?target=${UNSTAGED}`)).json()).toHaveLength(5)
  })

  it('tells open pages that comments changed', async () => {
    await setup()
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/events?token=${server.token}`)
    const events: ServerEvent[] = []
    socket.onmessage = (message) => events.push(JSON.parse(String(message.data)))
    const until = async (found: () => boolean) => {
      const deadline = Date.now() + 2000
      while (!found() && Date.now() < deadline) await Bun.sleep(20)
    }
    await until(() => events.some((event) => event.type === 'hello'))
    await call('POST', '/api/reviews', draft)
    await until(() => events.some((event) => event.type === 'changed'))
    socket.close()
    expect(events).toContainEqual({ type: 'changed', reason: 'reviews' })
  })
})
