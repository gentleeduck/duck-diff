import { join } from 'node:path'
import {
  blame,
  lastMessage,
  listRemotes,
  listSubmodules,
  listWorktrees,
  readSyncStatus,
  resolveRepo,
} from '@duck-diff/git'
import {
  BlameQuerySchema,
  type ChangeReason,
  ClientMessageSchema,
  CreateReviewSchema,
  decodeTarget,
  LspQuerySchema,
  NavigateRequestSchema,
  OpenRepoSchema,
  OpenRequestSchema,
  UpdateReviewSchema,
  WriteRequestSchema,
} from '@duck-diff/protocol'
import type { ServerWebSocket } from 'bun'
import { createToken, isAuthorized, tokenCookie } from './auth'
import { errorResponse, HttpError } from './errors'
import { createForge } from './forge'
import type { GitHubOptions } from './github'
import { handleGitHub } from './github-routes'
import { createGitHubWatch } from './github-watch'
import type { GitLabOptions } from './gitlab'
import { Hub } from './hub'
import { createJobs, jobTitle } from './jobs'
import { createNavigator, type NavigatorOptions } from './lsp/navigator'
import { type NvimRunner, openKeys, runNvim, tcdKeys } from './nvim'
import { createRepoList } from './repos'
import { createReviewStore } from './reviews'
import { handleApi, repoInfo } from './routes'
import { createSiblings, type StartServer, startSibling } from './siblings'
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
  // GitHub and GitLab access; tests swap in a fake fetch and token.
  github?: GitHubOptions
  gitlab?: GitLabOptions
  // Language servers; tests swap in a fake one.
  lsp?: NavigatorOptions
  // How a worktree or submodule gets its own server; tests swap in a fake.
  startSibling?: StartServer
  // The build this server runs; pages reload when it changes under them.
  build?: string
  // More repositories for the switcher, from repeated --repo; given means remember this one too.
  repos?: string[]
  // How often the GitHub watcher looks at what is due, and seconds between asks per topic; tests make both quick.
  githubTickMs?: number
  githubEvery?: Partial<Record<string, number>>
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
  const jobs = createJobs((event) => hub.broadcast(event))
  const reviews = createReviewStore(repo, options.dataDir)
  const github = createForge(repo, { github: options.github, gitlab: options.gitlab })
  const navigator = createNavigator(repo, { nvim: options.nvim, ...options.lsp })
  const repoList = createRepoList(options.dataDir)
  // Started from the command line (which always passes repos), this repo goes to the top of the switcher
  // with the extra ones after it; a server made in a test leaves the shared list alone.
  if (options.repos) {
    for (const extra of [...options.repos].reverse()) await repoList.add(extra).catch(() => {})
    await repoList.add(repo).catch(() => {})
  }
  const siblings = createSiblings(options.startSibling ?? startSibling(options.nvim ?? null))
  const watch = createGitHubWatch<ServerWebSocket<unknown>>(
    github,
    (socket, topic) => socket.send(JSON.stringify({ type: 'github', topic })),
    options.githubEvery,
  )
  const watching = setInterval(() => void watch.tick(), options.githubTickMs ?? 5000)

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
        if (url.pathname === '/api/jobs') return Response.json(jobs.list())
        if (url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/output')) {
          const output = jobs.output(decodeURIComponent(url.pathname.slice(10, -7)))
          if (output === null) throw new HttpError(404, 'not-found', 'no such job')
          return new Response(output, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
        }
        if (url.pathname === '/api/sync') return Response.json(await readSyncStatus(repo))
        if (url.pathname === '/api/remotes') return Response.json(await listRemotes(repo))
        if (url.pathname === '/api/last-message') return Response.json({ message: await lastMessage(repo) })
        if (url.pathname === '/api/blame') {
          const { path, ref } = BlameQuerySchema.parse(Object.fromEntries(url.searchParams))
          return Response.json(await blame(repo, path, ref))
        }
        if (url.pathname.startsWith('/api/lsp/')) {
          const query = LspQuerySchema.parse(Object.fromEntries(url.searchParams))
          const kind = url.pathname.slice('/api/lsp/'.length)
          if (kind === 'definition') return Response.json(await navigator.definition(query))
          if (kind === 'references') return Response.json(await navigator.references(query))
          if (kind === 'hover') return Response.json(await navigator.hover(query))
          throw new HttpError(404, 'not-found', `no ${url.pathname}`)
        }
        if (url.pathname.startsWith('/api/github/')) return await handleGitHub(github, repo, url, request, enqueue)
        if (url.pathname.startsWith('/api/git/') && request.method === 'POST') {
          const result = await enqueue(() => {
            const action = url.pathname.slice(9)
            return jobs.run(jobTitle(action), () => gitAction(repo, action, request))
          })
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
          await enqueue(() => jobs.run(jobTitle(write.action), () => applyWrite(repo, write, options.undoCache)))
          notify('index')
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/undo' && request.method === 'POST') {
          const restored = await enqueue(() => jobs.run('Undo', () => undoLatest(repo, options.undoCache)))
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
        if (url.pathname === '/api/repos') {
          if (request.method === 'POST') {
            const { path } = OpenRepoSchema.parse(await request.json())
            return Response.json({ path: await repoList.add(path) })
          }
          if (request.method === 'DELETE') {
            await repoList.remove(OpenRepoSchema.parse(Object.fromEntries(url.searchParams)).path)
            return new Response(null, { status: 204 })
          }
          return Response.json((await repoList.all()).map((entry) => ({ ...entry, current: entry.path === repo })))
        }
        if (url.pathname === '/api/open-repo' && request.method === 'POST') {
          const { path } = OpenRepoSchema.parse(await request.json())
          // Only checkouts this page knows: worktrees, submodules, and repositories in the switcher.
          const [trees, modules, listed] = await Promise.all([
            listWorktrees(repo),
            listSubmodules(repo),
            repoList.all(),
          ])
          const known = [
            ...trees.map((tree) => tree.path),
            ...modules.map((module) => join(repo, module.path)),
            ...listed.map((entry) => entry.path),
          ]
          if (!known.includes(path))
            throw new HttpError(404, 'not-found', `${path} is not a worktree or submodule here`)
          return Response.json({ url: await siblings.open(path) })
        }
        if (url.pathname === '/api/nvim/tcd' && request.method === 'POST') {
          if (!options.nvim) throw new HttpError(409, 'bad-request', 'no Neovim attached to this server')
          const { path } = OpenRepoSchema.parse(await request.json())
          await (options.runNvim ?? runNvim)(['--server', options.nvim, '--remote-send', tcdKeys(path)])
          return new Response(null, { status: 204 })
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
        if (url.pathname.startsWith('/api/')) return await handleApi(repo, url, Boolean(options.nvim), options.build)
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
        const info = await repoInfo(repo, Boolean(options.nvim), options.build).catch(() => null)
        if (info) socket.send(JSON.stringify({ type: 'hello', repo: info, build: options.build }))
      },
      close(socket) {
        hub.remove(socket)
        watch.unsubscribe(socket)
      },
      message(socket, raw) {
        let data: unknown
        try {
          data = JSON.parse(String(raw))
        } catch {
          return
        }
        const parsed = ClientMessageSchema.safeParse(data)
        if (!parsed.success) return
        watch.subscribe(socket, parsed.data.topics)
        void watch.tick()
      },
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
      clearInterval(watching)
      hub.dispose()
      await navigator.stop()
      await siblings.stop()
      await server.stop(true)
    },
  }
}
