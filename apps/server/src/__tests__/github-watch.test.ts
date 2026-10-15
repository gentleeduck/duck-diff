import { describe, expect, it } from 'bun:test'
import { createGitHubWatch, type WatchSource } from '../github-watch'

function source() {
  const asked: string[] = []
  const answers = new Map<string, { changed: boolean | null; pollSeconds?: number }>()
  const updated = new Map<number, string>()
  const itemCalls: number[][] = []
  const src: WatchSource = {
    async probe(topic) {
      asked.push(topic)
      return answers.get(topic) ?? { changed: false }
    },
    async itemsUpdatedAt(numbers) {
      itemCalls.push([...numbers])
      return new Map(numbers.flatMap((n) => (updated.has(n) ? [[n, updated.get(n) as string]] : [])))
    },
  }
  return { src, asked, answers, updated, itemCalls }
}

describe('GitHub watch', () => {
  it('polls each topic once however many pages watch it, and pushes only to them on a change', async () => {
    const { src, asked, answers } = source()
    const pushed: [string, string][] = []
    const watch = createGitHubWatch(src, (page, topic) => pushed.push([page as string, topic]))
    watch.subscribe('a', ['runs', 'notifications'])
    watch.subscribe('b', ['runs'])
    await watch.tick()
    expect(asked.sort()).toEqual(['notifications', 'runs'])
    expect(pushed).toEqual([])

    answers.set('runs', { changed: true })
    await watch.tick(Date.now() + 120_000)
    expect(pushed.sort()).toEqual([
      ['a', 'runs'],
      ['b', 'runs'],
    ])
  })

  it('asks a topic again only when its interval, or GitHub poll interval, has passed', async () => {
    const { src, asked, answers } = source()
    const watch = createGitHubWatch(src, () => {})
    watch.subscribe('a', ['notifications'])
    answers.set('notifications', { changed: false, pollSeconds: 120 })
    const start = Date.now()
    await watch.tick(start)
    await watch.tick(start + 61_000)
    expect(asked).toEqual(['notifications'])
    await watch.tick(start + 121_000)
    expect(asked).toEqual(['notifications', 'notifications'])
  })

  it('reads every watched item in one batch and pushes the ones whose time moved', async () => {
    const { src, updated, itemCalls } = source()
    const pushed: string[] = []
    const watch = createGitHubWatch(src, (_, topic) => pushed.push(topic))
    watch.subscribe('a', ['item:3', 'item:7'])
    watch.subscribe('b', ['item:7'])
    updated.set(3, 't1').set(7, 't1')
    const start = Date.now()
    await watch.tick(start)
    expect(itemCalls).toEqual([[3, 7]])
    expect(pushed).toEqual([])
    updated.set(7, 't2')
    await watch.tick(start + 60_000)
    expect(pushed).toEqual(['item:7', 'item:7'])
  })

  it('stops asking once nobody watches', async () => {
    const { src, asked } = source()
    const watch = createGitHubWatch(src, () => {})
    watch.subscribe('a', ['runs'])
    watch.unsubscribe('a')
    await watch.tick()
    expect(asked).toEqual([])
    expect(watch.topics()).toEqual([])
  })
})

describe('GitHub watch over the event socket', () => {
  it('asks GitHub once for two pages and pushes one event to each when the ETag changes', async () => {
    const { createRepo } = await import('@duck-diff/testing')
    const { createServer } = await import('../server')
    const { testPort } = await import('./helpers')
    const repo = createRepo()
    repo.git('remote', 'add', 'origin', 'https://github.com/o/r.git')
    let etag = '"v1"'
    let asks = 0
    const server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      githubTickMs: 20,
      githubEvery: { runs: 0.1 },
      github: {
        findToken: async () => ({ token: 't', source: 'gh' }),
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(String(input))
          if (url.pathname !== '/repos/o/r/actions/runs') return Response.json({})
          asks++
          if (new Headers(init?.headers).get('if-none-match') === etag) return new Response(null, { status: 304 })
          return new Response('{"workflow_runs":[]}', { headers: { etag } })
        }) as typeof fetch,
      },
    })
    const events: string[][] = [[], []]
    const sockets = [0, 1].map((index) => {
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/events`, {
        headers: { 'x-duck-diff-token': server.token },
      } as unknown as string[])
      socket.onmessage = (message) => {
        const event = JSON.parse(String(message.data))
        if (event.type === 'github') events[index]?.push(event.topic)
      }
      return socket
    })
    try {
      await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.addEventListener('open', resolve))))
      for (const socket of sockets) socket.send(JSON.stringify({ type: 'watch', topics: ['runs'] }))
      // A bad message is ignored rather than closing the socket.
      sockets[0]?.send('{"type":"watch","topics":["../etc"]}')
      await Bun.sleep(60)
      expect(asks).toBe(1)
      expect(events).toEqual([[], []])
      etag = '"v2"'
      await Bun.sleep(200)
      // One ask per interval for both pages, and one event each for the one change.
      expect(asks).toBeLessThanOrEqual(4)
      expect(events).toEqual([['runs'], ['runs']])
    } finally {
      for (const socket of sockets) socket.close()
      await server.stop()
      repo.cleanup()
    }
  })
})
