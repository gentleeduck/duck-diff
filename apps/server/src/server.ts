import { basename, join } from 'node:path'
import {
  blame,
  duckHome,
  lastMessage,
  listRemotes,
  listSubmodules,
  listWorktrees,
  readCheckout,
  readSyncStatus,
  repoId,
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
  targetKey,
  UpdateReviewSchema,
  WriteRequestSchema,
} from '@duck-diff/protocol'
import type { ServerWebSocket } from 'bun'
import { z } from 'zod'
import { createToken, isAuthorized, tokenCookie } from './auth'
import { createDiskCache } from './disk-cache'
import { launch, pickOpener } from './editor'
import { errorResponse, HttpError } from './errors'
import { createForge } from './forge'
import type { GitHubOptions } from './github'
import { handleGitHub } from './github-routes'
import { createGitHubWatch } from './github-watch'
import type { GitLabOptions } from './gitlab'
import { Hub } from './hub'
import { instanceFile, liveInstance, pageUrl } from './instance'
import { createJobs, jobTitle } from './jobs'
import { createNavigator, type NavigatorOptions } from './lsp/navigator'
import { createRepoMemo } from './memo'
import { type NvimRunner, openKeys, runNvim, tcdKeys } from './nvim'
import { createTerminals, type TerminalPeer } from './pty'
import { createRepoList } from './repos'
import { reviewPrompt } from './review-prompt'
import { createReviewStore } from './reviews'
import { handleApi, repoInfo } from './routes'
import { createSiblings, pageOpener, type StartServer, startSibling } from './siblings'
import {
  createMemoryState,
  createStateStore,
  openingTarget,
  opensGraph,
  pageDiff,
  pageGraph,
  pageState,
  rememberedTarget,
} from './state'
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
  // Tests choose where files open; by default the best on this machine (editor.ts).
  pickOpener?: typeof pickOpener
  // Where discard snapshots go, and where everything else saved goes (~/.duck-diff); tests use temp folders.
  undoHome?: string
  dataDir?: string
  // GitHub and GitLab access; tests swap in a fake fetch and token.
  github?: GitHubOptions
  gitlab?: GitLabOptions
  // Language servers; tests swap in a fake one.
  lsp?: NavigatorOptions
  // How a worktree or submodule gets its own server, and how its page opens; tests swap in fakes.
  startSibling?: StartServer
  openPage?: (url: string) => Promise<boolean>
  // The build this server runs; pages reload when it changes under them.
  build?: string
  // More repositories for the switcher, from repeated --repo; given means remember this one too.
  repos?: string[]
  // How often the GitHub watcher looks at what is due, and seconds between asks per topic; tests make both quick.
  githubTickMs?: number
  githubEvery?: Partial<Record<string, number>>
  // Shells in the page; false turns them off. Tests pick the shell.
  terminal?: boolean | { shell: string; args: string[] }
  // Keep GitHub answers, commits, the graph and the output history on disk between runs. The command line
  // turns it on; servers made in tests leave the data folder alone.
  persist?: boolean
}

export interface RunningServer {
  port: number
  token: string
  url: string
  repo: string
  // handOver: a new build of this server takes over in place, and the servers it started for other checkouts
  // stay up under it.
  stop(options?: { handOver?: boolean }): Promise<void>
  notify(reason: ChangeReason): void
}

const HOST = '127.0.0.1'

type SocketData = { kind: 'events' } | { kind: 'pty'; id: string; peer: TerminalPeer | null }

const LspWarmSchema = z.object({ paths: z.array(z.string().max(4096)).max(50) })
const PtyQuerySchema = z.object({
  id: z.string().max(64).optional(),
  cols: z.coerce.number().int().min(2).max(1000).default(80),
  rows: z.coerce.number().int().min(2).max(500).default(24),
})
const PtyMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(1_000_000) }),
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(2).max(1000),
    rows: z.number().int().min(2).max(500),
  }),
])
const DEFAULT_IDLE_MS = 600_000
const HAND_OVER_WAIT_MS = 120_000
const MAX_QUERIES_BYTES = 20 * 1024 * 1024
const MAX_TOKENS_BYTES = 2 * 1024 * 1024
const SavedTokensSchema = z.object({ key: z.string().max(4000), tokens: z.record(z.string(), z.unknown()) })
const StateChangesSchema = z.object({ changes: z.record(z.string().max(200), z.string().max(1_000_000).nullable()) })
const serveWeb = createWebHandler(WEB_ASSETS)

export async function createServer(options: ServerOptions): Promise<RunningServer> {
  const repo = await resolveRepo(options.repo)
  const token = options.token ?? createToken()
  const hub = new Hub<SocketData>(options.idleTimeoutMs ?? DEFAULT_IDLE_MS, options.onIdle ?? (() => {}))
  // Without the watcher nothing would say when a kept diff went stale, so nothing is kept.
  const memo = options.watch === false ? undefined : createRepoMemo()
  const notify = (reason: ChangeReason) => {
    if (reason !== 'reviews') memo?.changed()
    hub.broadcast({ type: 'changed', reason })
  }
  const stopWatching = options.watch === false ? () => {} : watchRepo(repo, notify)
  const enqueue = createWriteQueue()
  const cache = options.persist ? createDiskCache(join(options.dataDir ?? duckHome(), repoId(repo))) : undefined
  const jobs = createJobs((event) => hub.broadcast(event), { cache })
  const terminals =
    options.terminal === false
      ? null
      : createTerminals({ cwd: repo, ...(typeof options.terminal === 'object' ? options.terminal : {}) })
  const reviews = createReviewStore(repo, options.dataDir)
  const state = options.persist ? createStateStore(options.dataDir ?? duckHome(), repo) : createMemoryState()
  const stopStateWatch = state.watch((changes) => hub.broadcast({ type: 'state', changes }))
  const github = createForge(repo, { github: { ...options.github, cache }, gitlab: options.gitlab })
  const navigator = createNavigator(repo, { nvim: options.nvim, ...options.lsp })
  const repoList = createRepoList(options.dataDir)
  // Only checkouts this page knows: worktrees, submodules, and repositories in the switcher.
  const knownCheckouts = async () => {
    const [trees, modules, listed] = await Promise.all([listWorktrees(repo), listSubmodules(repo), repoList.all()])
    return [
      ...trees.map((tree) => tree.path),
      ...modules.map((module) => join(repo, module.path)),
      ...listed.map((entry) => entry.path),
    ]
  }
  // Started from the command line (which always passes repos), this repo goes to the top of the switcher
  // with the extra ones after it; a server made in a test leaves the shared list alone.
  if (options.repos) {
    for (const extra of [...options.repos].reverse()) await repoList.add(extra).catch(() => {})
    await repoList.add(repo).catch(() => {})
  }
  const siblings = createSiblings(options.startSibling ?? startSibling(options.nvim ?? null), async (path) => {
    const kept = await liveInstance(instanceFile(options.dataDir ?? duckHome(), path))
    return kept ? pageUrl(kept, '/') : null
  })
  const watch = createGitHubWatch<ServerWebSocket<SocketData>>(
    github,
    (socket, topic) => socket.send(JSON.stringify({ type: 'github', topic })),
    options.githubEvery,
  )
  const watching = setInterval(() => void watch.tick(), options.githubTickMs ?? 5000)

  const server = Bun.serve<SocketData>({
    hostname: HOST,
    port: options.port ?? 0,
    async fetch(request, bun) {
      const url = new URL(request.url)
      try {
        const port = bun.port ?? 0
        if (!isAuthorized(request, token, port)) throw new HttpError(401, 'unauthorized', 'missing or wrong token')
        if (url.pathname === '/api/events') {
          if (bun.upgrade(request, { data: { kind: 'events' } })) return undefined
          throw new HttpError(400, 'bad-request', 'expected a websocket upgrade')
        }
        if (url.pathname === '/api/saved' && request.method === 'POST') {
          hub.touch()
          notify('saved')
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/pty') {
          if (!terminals) throw new HttpError(404, 'not-found', 'terminals are turned off')
          // The cookie already ties the socket to this page; the origin check also refuses other local sites.
          const origin = request.headers.get('origin')
          if (origin && origin !== `http://${HOST}:${port}` && origin !== `http://localhost:${port}`) {
            throw new HttpError(403, 'unauthorized', 'terminals only open from the page')
          }
          const query = PtyQuerySchema.parse(Object.fromEntries(url.searchParams))
          const session = query.id ? terminals.get(query.id) : terminals.open(query)
          if (!session) throw new HttpError(404, 'not-found', 'that terminal has closed')
          if (bun.upgrade(request, { data: { kind: 'pty', id: session.id, peer: null } })) return undefined
          throw new HttpError(400, 'bad-request', 'expected a websocket upgrade')
        }
        if (url.pathname === '/api/terminals') return Response.json(terminals?.list() ?? [])
        if (url.pathname.startsWith('/api/terminals/') && request.method === 'DELETE') {
          terminals?.get(decodeURIComponent(url.pathname.slice(15)))?.close()
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/cache/clear' && request.method === 'POST') {
          await cache?.clear()
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/jobs' && request.method === 'DELETE') {
          jobs.clear()
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
          const { path, ref, mergeBase } = BlameQuerySchema.parse(Object.fromEntries(url.searchParams))
          return Response.json(await blame(repo, path, ref, mergeBase))
        }
        if (url.pathname === '/api/lsp/warm' && request.method === 'POST') {
          const { paths } = LspWarmSchema.parse(await request.json())
          // Started in the background; the page does not wait for a server to come up.
          void navigator.warm(paths).catch(() => {})
          return new Response(null, { status: 204 })
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
            return jobs.run(jobTitle(action), () => gitAction(repo, action, request), action)
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
          await enqueue(() => jobs.run(jobTitle(write.action), () => applyWrite(repo, write, options.undoHome)))
          notify('index')
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/undo' && request.method === 'POST') {
          const restored = await enqueue(() => jobs.run('Undo', () => undoLatest(repo, options.undoHome)))
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
        if (url.pathname === '/api/reviews/prompt') {
          const raw = url.searchParams.get('target')
          if (!raw) throw new HttpError(400, 'bad-request', 'missing target')
          const target = decodeTarget(raw)
          const id = url.searchParams.get('id')
          const listed = await reviews.list(target)
          const picked = id ? listed.filter((comment) => comment.id === id) : listed
          if (id && !picked.length) throw new HttpError(404, 'not-found', 'no such comment')
          return new Response(await reviewPrompt(repo, target, picked), {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
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
          const listed = await repoList.all()
          // Other servers can push this one out of the list; its page still shows where it is.
          const entries = listed.some((entry) => entry.path === repo)
            ? listed
            : [{ path: repo, name: basename(repo) }, ...listed]
          return Response.json(entries.map((entry) => ({ ...entry, current: entry.path === repo })))
        }
        if (url.pathname === '/api/checkout') {
          const { path } = OpenRepoSchema.parse(Object.fromEntries(url.searchParams))
          if (path !== repo && !(await knownCheckouts()).includes(path))
            throw new HttpError(404, 'not-found', `${path} is not a checkout this page lists`)
          return Response.json(await readCheckout(path))
        }
        if (url.pathname === '/api/open-repo' && request.method === 'POST') {
          const { path } = OpenRepoSchema.parse(await request.json())
          if (!(await knownCheckouts()).includes(path))
            throw new HttpError(404, 'not-found', `${path} is not a worktree or submodule here`)
          const sibling = await siblings.open(path)
          const opened = await (options.openPage ?? pageOpener(options.nvim ?? null))(sibling)
          return Response.json({ url: sibling, opened })
        }
        if (url.pathname === '/api/nvim/tcd' && request.method === 'POST') {
          if (!options.nvim) throw new HttpError(409, 'bad-request', 'no Neovim attached to this server')
          const { path } = OpenRepoSchema.parse(await request.json())
          await (options.runNvim ?? runNvim)(['--server', options.nvim, '--remote-send', tcdKeys(path)])
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/open' && request.method === 'POST') {
          const { path, line } = OpenRequestSchema.parse(await request.json())
          const opener = (options.pickOpener ?? pickOpener)({ nvim: options.nvim ?? null })
          if (opener.how === 'nvim' && options.nvim) {
            await (options.runNvim ?? runNvim)([
              '--server',
              options.nvim,
              '--remote-send',
              openKeys(`${repo}/${path}`, line),
            ])
            return Response.json({ how: 'nvim' })
          }
          if (opener.how === 'nvim') return Response.json({ how: 'nvim' })
          await launch(opener, repo, path, line).catch((error: Error) => {
            throw new HttpError(502, 'failed', `Could not start ${opener.command}: ${error.message}`)
          })
          return Response.json({ how: opener.how, command: opener.command })
        }
        if (url.pathname === '/api/state') {
          if (request.method === 'PUT') {
            const { changes } = StateChangesSchema.parse(await request.json())
            await state.update(changes)
            return new Response(null, { status: 204 })
          }
          return Response.json(await state.values())
        }
        // The colors a page worked out for the diff it shows, kept only while that diff is the one held.
        if (url.pathname === '/api/state/tokens' && request.method === 'PUT') {
          const text = await request.text()
          if (text.length > MAX_TOKENS_BYTES) throw new HttpError(413, 'bad-request', 'too many colors')
          const { key, tokens } = SavedTokensSchema.parse(JSON.parse(text))
          const stamp = memo?.stamp() ?? 0
          if (memo?.get(`diff:${key}`) !== undefined) memo.set(`tokens:${key}`, JSON.stringify(tokens), stamp)
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/state/queries') {
          if (request.method === 'PUT') {
            const text = await request.text()
            if (text.length > MAX_QUERIES_BYTES) throw new HttpError(413, 'bad-request', 'the query cache is too big')
            await state.setQueries(text)
            return new Response(null, { status: 204 })
          }
          throw new HttpError(405, 'bad-request', 'the saved queries come with the page')
        }
        if (url.pathname.startsWith('/api/'))
          return await handleApi(repo, url, Boolean(options.nvim), options.build, cache, memo)
        const response = serveWeb(url.pathname)
        // The page is opened with ?token once; the cookie carries it to assets, the api and the socket.
        if (response.headers.get('content-type')?.startsWith('text/html')) {
          const values = await state.values()
          const remembered = rememberedTarget(url, values, repo)
          if (remembered) {
            const next = new URL(url)
            next.searchParams.set('target', remembered)
            return new Response(null, { status: 302, headers: { location: `${next.pathname}${next.search}` } })
          }
          let html = pageState(await response.text(), values, await state.queries())
          const opening = memo ? openingTarget(url) : null
          if (memo && opening) {
            const key = targetKey(opening)
            html = pageDiff(html, key, memo.get(`files:${key}`), memo.get(`diff:${key}`), memo.get(`tokens:${key}`))
          }
          // The graph view's default: the current branch, up to 20,000 commits (web graph/store.ts).
          if (memo && opensGraph(url))
            html = pageGraph(html, 'false:20000', memo.get('graph:false:20000'), memo.get('refs'))
          const page = new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
          })
          page.headers.set('set-cookie', `${tokenCookie(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`)
          return page
        }
        return response
      } catch (error) {
        return errorResponse(error)
      }
    },
    websocket: {
      async open(socket) {
        if (socket.data.kind === 'pty') {
          const session = terminals?.get(socket.data.id)
          if (!session) return socket.close(4404, 'closed')
          const peer: TerminalPeer = {
            output: (data) => socket.sendBinary(data),
            control: (message) => socket.send(JSON.stringify(message)),
          }
          socket.data.peer = peer
          socket.send(JSON.stringify({ type: 'ready', id: session.id, title: session.title }))
          session.attach(peer)
          return
        }
        hub.add(socket)
        // The repo can disappear under a running server; a missing hello is better than a crash.
        const info = await repoInfo(repo, Boolean(options.nvim), options.build).catch(() => null)
        if (info) socket.send(JSON.stringify({ type: 'hello', repo: info, build: options.build }))
        socket.send(JSON.stringify({ type: 'state', changes: await state.values(), all: true }))
      },
      close(socket) {
        if (socket.data.kind === 'pty') {
          const { peer, id } = socket.data
          if (peer) terminals?.get(id)?.detach(peer)
          return
        }
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
        if (socket.data.kind === 'pty') {
          const session = terminals?.get(socket.data.id)
          const parsed = PtyMessageSchema.safeParse(data)
          if (!session || !parsed.success) return
          if (parsed.data.type === 'input') session.input(parsed.data.data)
          else session.resize(parsed.data.cols, parsed.data.rows)
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
    async stop({ handOver = false } = {}) {
      // A new build waits for a push or commit in flight rather than cutting it off, within reason.
      if (handOver) await Promise.race([enqueue(async () => {}), Bun.sleep(HAND_OVER_WAIT_MS)])
      stopWatching()
      clearInterval(watching)
      stopStateWatch()
      hub.dispose()
      terminals?.dispose()
      await cache?.flush()
      await navigator.stop()
      await siblings.stop({ keep: handOver })
      await server.stop(true)
    },
  }
}
