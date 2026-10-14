import { resolveRepo } from '@duck-diff/git'
import { type ChangeReason, OpenRequestSchema, WriteRequestSchema } from '@duck-diff/protocol'
import { createToken, isAuthorized, TOKEN_COOKIE } from './auth'
import { errorResponse, HttpError } from './errors'
import { Hub } from './hub'
import { type NvimRunner, openKeys, runNvim } from './nvim'
import { handleApi, repoInfo } from './routes'
import { watchRepo } from './watch'
import { createWebHandler } from './web'
import { WEB_ASSETS } from './web-assets.gen'
import { applyWrite, createWriteQueue, undoLatest } from './writes'

export interface ServerOptions {
  repo: string
  token?: string
  port?: number
  idleTimeoutMs?: number
  watch?: boolean
  onIdle?: () => void
  // Address of the Neovim that started the server, so the page can open files in it.
  nvim?: string | null
  runNvim?: NvimRunner
  // Where discard snapshots go; tests point it at a temp folder.
  undoCache?: string
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
const serveWeb = createWebHandler(WEB_ASSETS)

export async function createServer(options: ServerOptions): Promise<RunningServer> {
  const repo = await resolveRepo(options.repo)
  const token = options.token ?? createToken()
  const hub = new Hub(options.idleTimeoutMs ?? DEFAULT_IDLE_MS, options.onIdle ?? (() => {}))
  const notify = (reason: ChangeReason) => hub.broadcast({ type: 'changed', reason })
  const stopWatching = options.watch === false ? () => {} : watchRepo(repo, notify)
  const enqueue = createWriteQueue()

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
        if (url.pathname === '/api/write' && request.method === 'POST') {
          const write = WriteRequestSchema.parse(await request.json())
          await enqueue(() => applyWrite(repo, write, options.undoCache))
          notify('index')
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/undo' && request.method === 'POST') {
          const restored = await enqueue(() => undoLatest(repo, options.undoCache))
          if (restored) notify('worktree')
          return Response.json({ restored })
        }
        if (url.pathname === '/api/open' && request.method === 'POST') {
          if (!options.nvim) throw new HttpError(409, 'bad-request', 'no Neovim attached to this server')
          const { path, line } = OpenRequestSchema.parse(await request.json())
          await (options.runNvim ?? runNvim)([
            '--server',
            options.nvim,
            '--remote-send',
            openKeys(`${repo}/${path}`, line),
          ])
          return new Response(null, { status: 204 })
        }
        if (url.pathname.startsWith('/api/')) return await handleApi(repo, url, Boolean(options.nvim))
        const response = serveWeb(url.pathname)
        // The page is opened with ?token once; the cookie carries it to assets, the api and the socket.
        if (response.headers.get('content-type')?.startsWith('text/html')) {
          response.headers.set('set-cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`)
        }
        return response
      } catch (error) {
        return errorResponse(error)
      }
    },
    websocket: {
      async open(socket) {
        hub.add(socket)
        socket.send(JSON.stringify({ type: 'hello', repo: await repoInfo(repo, Boolean(options.nvim)) }))
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
