import { readSyncStatus, resolveRepo } from '@duck-diff/git'
import {
  type ChangeReason,
  CreateReviewSchema,
  decodeTarget,
  NavigateRequestSchema,
  OpenRequestSchema,
  UpdateReviewSchema,
  WriteRequestSchema,
} from '@duck-diff/protocol'
import { createToken, isAuthorized, tokenCookie } from './auth'
import { errorResponse, HttpError } from './errors'
import { createGitHub, type GitHubOptions } from './github'
import { handleGitHub } from './github-routes'
import { Hub } from './hub'
import { type NvimRunner, openKeys, runNvim } from './nvim'
import { createReviewStore } from './reviews'
import { handleApi, repoInfo } from './routes'
import { watchRepo } from './watch'
import { createWebHandler } from './web'
import { WEB_ASSETS } from './web-assets.gen'
import { applyWrite, createWriteQueue, gitAction, undoLatest } from './writes'

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
  // Where review comments are kept; tests point it at a temp folder.
  dataDir?: string
  // GitHub access; tests swap in a fake fetch and token.
  github?: GitHubOptions
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
  const reviews = createReviewStore(repo, options.dataDir)
  const github = createGitHub(repo, options.github)

  const server = Bun.serve({
    hostname: HOST,
    port: options.port ?? 0,
    async fetch(request, bun) {
      const url = new URL(request.url)
      try {
        const port = bun.port ?? 0
        if (!isAuthorized(request, token, port)) throw new HttpError(401, 'unauthorized', 'missing or wrong token')
        if (url.pathname === '/api/events') {
          if (bun.upgrade(request)) return undefined
          throw new HttpError(400, 'bad-request', 'expected a websocket upgrade')
        }
        if (url.pathname === '/api/saved' && request.method === 'POST') {
          hub.touch()
          notify('saved')
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/sync') return Response.json(await readSyncStatus(repo))
        if (url.pathname.startsWith('/api/github/')) return await handleGitHub(github, repo, url, request, enqueue)
        if (url.pathname.startsWith('/api/git/') && request.method === 'POST') {
          const result = await enqueue(() => gitAction(repo, url.pathname.slice(9), request))
          notify(result.reason)
          return Response.json(result.body)
        }
        if (url.pathname === '/api/navigate' && request.method === 'POST') {
          const { target } = NavigateRequestSchema.parse(await request.json())
          hub.broadcast({ type: 'navigate', target })
          return Response.json({ pages: hub.size })
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
        if (url.pathname === '/api/reviews') {
          if (request.method === 'POST') {
            const input = CreateReviewSchema.parse(await request.json())
            const comment = await enqueue(() => reviews.create(input))
            notify('reviews')
            return Response.json(comment, { status: 201 })
          }
          const raw = url.searchParams.get('target')
          if (!raw) throw new HttpError(400, 'bad-request', 'missing target')
          return Response.json(await reviews.list(decodeTarget(raw)))
        }
        if (url.pathname.startsWith('/api/reviews/')) {
          const id = decodeURIComponent(url.pathname.slice('/api/reviews/'.length))
          if (request.method === 'PATCH') {
            const { body } = UpdateReviewSchema.parse(await request.json())
            const comment = await enqueue(() => reviews.update(id, body))
            notify('reviews')
            return Response.json(comment)
          }
          if (request.method === 'DELETE') {
            await enqueue(() => reviews.remove(id))
            notify('reviews')
            return new Response(null, { status: 204 })
          }
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
          response.headers.set('set-cookie', `${tokenCookie(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`)
        }
        return response
      } catch (error) {
        return errorResponse(error)
      }
    },
    websocket: {
      async open(socket) {
        hub.add(socket)
        // The repo can disappear under a running server; a missing hello is better than a crash.
        const info = await repoInfo(repo, Boolean(options.nvim)).catch(() => null)
        if (info) socket.send(JSON.stringify({ type: 'hello', repo: info }))
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
