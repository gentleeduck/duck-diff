import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo
let server: RunningServer
afterEach(async () => {
  await server.stop()
  repo.cleanup()
})

function open(socketUrl: string): Promise<{ socket: WebSocket; messages: unknown[] }> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = []
    const socket = new WebSocket(socketUrl)
    socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)))
    socket.onopen = () => resolve({ socket, messages })
    socket.onerror = reject
  })
}

async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await Bun.sleep(20)
  }
}

describe('events', () => {
  it('rejects a socket without the token', async () => {
    repo = createRepo()
    server = await createServer({ repo: repo.path, port: testPort(), watch: false })
    const response = await fetch(`http://127.0.0.1:${server.port}/api/events`, { headers: { upgrade: 'websocket' } })
    expect(response.status).toBe(401)
  })

  it('sends hello and the saved values, then changed on notify and on /api/saved', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    server = await createServer({ repo: repo.path, port: testPort(), watch: false })
    const { socket, messages } = await open(`ws://127.0.0.1:${server.port}/api/events?token=${server.token}`)
    await waitFor(() => messages.length === 2)
    expect(messages[0]).toMatchObject({ type: 'hello', repo: { branch: 'main' } })
    expect(messages[1]).toEqual({ type: 'state', changes: {} })

    server.notify('worktree')
    await waitFor(() => messages.length === 3)
    expect(messages[2]).toEqual({ type: 'changed', reason: 'worktree' })

    await fetch(`http://127.0.0.1:${server.port}/api/saved`, {
      method: 'POST',
      headers: { 'x-duck-diff-token': server.token },
    })
    await waitFor(() => messages.length === 4)
    expect(messages[3]).toEqual({ type: 'changed', reason: 'saved' })
    socket.close()
  })

  it('pushes what one page saves to every open page', async () => {
    repo = createRepo()
    server = await createServer({ repo: repo.path, port: testPort(), watch: false })
    const { socket, messages } = await open(`ws://127.0.0.1:${server.port}/api/events?token=${server.token}`)
    await waitFor(() => messages.length === 2)
    await fetch(`http://127.0.0.1:${server.port}/api/state`, {
      method: 'PUT',
      headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
      body: JSON.stringify({ changes: { 'duck-diff:settings': '{"fontSize":16}' } }),
    })
    await waitFor(() => messages.length === 3)
    expect(messages[2]).toEqual({ type: 'state', changes: { 'duck-diff:settings': '{"fontSize":16}' } })
    socket.close()
  })

  it('tells open pages to switch comparison and reports how many listened', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    server = await createServer({ repo: repo.path, port: testPort(), watch: false })
    const navigate = () =>
      fetch(`http://127.0.0.1:${server.port}/api/navigate`, {
        method: 'POST',
        headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
        body: JSON.stringify({ target: { kind: 'staged' } }),
      }).then((response) => response.json())
    expect(await navigate()).toEqual({ pages: 0 })
    const { socket, messages } = await open(`ws://127.0.0.1:${server.port}/api/events?token=${server.token}`)
    await waitFor(() => messages.length > 0)
    expect(await navigate()).toEqual({ pages: 1 })
    await waitFor(() => messages.some((message) => (message as { type: string }).type === 'navigate'))
    expect(messages).toContainEqual({ type: 'navigate', target: { kind: 'staged' } })
    socket.close()
  })

  it('pushes watcher changes to clients', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    server = await createServer({ repo: repo.path, port: testPort(), watch: true })
    const { socket, messages } = await open(`ws://127.0.0.1:${server.port}/api/events?token=${server.token}`)
    await waitFor(() => messages.length === 2)
    repo.write('a.txt', '2\n')
    await waitFor(() => messages.length === 3)
    expect(messages[2]).toEqual({ type: 'changed', reason: 'worktree' })
    socket.close()
  })

  it('calls onIdle when no client connects in time', async () => {
    repo = createRepo()
    let idle = false
    server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      idleTimeoutMs: 100,
      onIdle: () => {
        idle = true
      },
    })
    await waitFor(() => idle)
    expect(idle).toBe(true)
  })

  it('does not go idle while a client is connected', async () => {
    repo = createRepo()
    let idle = false
    server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      idleTimeoutMs: 100,
      onIdle: () => {
        idle = true
      },
    })
    const { socket } = await open(`ws://127.0.0.1:${server.port}/api/events?token=${server.token}`)
    await Bun.sleep(300)
    expect(idle).toBe(false)
    socket.close()
  })
})
