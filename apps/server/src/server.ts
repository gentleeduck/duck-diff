import { resolveRepo } from '@duck-diff/git'
import type { ChangeReason } from '@duck-diff/protocol'
import pageBundle from '../static/index.html' with { type: 'file' }
import { createToken, isAuthorized, TOKEN_COOKIE } from './auth'
import { errorResponse, HttpError } from './errors'
import { Hub } from './hub'
import { handleApi, repoInfo } from './routes'
import { watchRepo } from './watch'

export interface ServerOptions {
  repo: string
  token?: string
  port?: number
  idleTimeoutMs?: number
  watch?: boolean
  onIdle?: () => void
}

export interface RunningServer {
  port: number
  token: string
  url: string
  repo: string
  stop(): Promise<void>
  notify(reason: ChangeReason): void
}

const HOST = '127.0.0.1'
const DEFAULT_IDLE_MS = 600_000
// Bun types every .html import as a bundle, but `type: 'file'` yields the embedded file path.
const page = pageBundle as unknown as string

export async function createServer(options: ServerOptions): Promise<RunningServer> {
  const repo = await resolveRepo(options.repo)
  const token = options.token ?? createToken()
  const hub = new Hub(options.idleTimeoutMs ?? DEFAULT_IDLE_MS, options.onIdle ?? (() => {}))
  const notify = (reason: ChangeReason) => hub.broadcast({ type: 'changed', reason })
  const stopWatching = options.watch === false ? () => {} : watchRepo(repo, notify)

  const server = Bun.serve({
    hostname: HOST,
    port: options.port ?? 0,
    async fetch(request, bun) {
      const url = new URL(request.url)
      try {
        if (!isAuthorized(request, token)) throw new HttpError(401, 'unauthorized', 'missing or wrong token')
        if (url.pathname === '/api/events') {
          if (bun.upgrade(request)) return undefined
          throw new HttpError(400, 'bad-request', 'expected a websocket upgrade')
        }
        if (url.pathname === '/api/saved' && request.method === 'POST') {
          hub.touch()
          notify('saved')
          return new Response(null, { status: 204 })
        }
        if (url.pathname.startsWith('/api/')) return await handleApi(repo, url)
        return new Response(Bun.file(page), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'set-cookie': `${TOKEN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
          },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
    websocket: {
      async open(socket) {
        hub.add(socket)
        socket.send(JSON.stringify({ type: 'hello', repo: await repoInfo(repo) }))
      },
      close(socket) {
        hub.remove(socket)
      },
      message() {},
    },
  })

  const port = server.port ?? 0
  return {
    port,
    token,
    repo,
    url: `http://${HOST}:${port}/?token=${token}`,
    notify,
    async stop() {
      stopWatching()
      hub.dispose()
      await server.stop(true)
    },
  }
}
