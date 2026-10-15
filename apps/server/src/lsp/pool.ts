import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readTreeFile } from '@duck-diff/git'
import type { LspHover, LspLocations, LspQuery } from '@duck-diff/protocol'
import { hoverText, resolveLocations, toLocations } from './locations'
import { RpcConnection } from './rpc'
import { candidates, SERVERS, type ServerSpec, specFor } from './servers'

export interface LspPoolOptions {
  idleMs?: number
  env?: NodeJS.ProcessEnv
  servers?: ServerSpec[]
}

export interface LspPool {
  definition(query: LspQuery): Promise<LspLocations>
  references(query: LspQuery): Promise<LspLocations>
  hover(query: LspQuery): Promise<LspHover>
  // The servers running now, for tests and the health line.
  running(): string[]
  // Whether the server for this file is up, so a question gets a quick answer.
  ready(path: string): boolean
  // Starts the servers these files need and opens one file each, so the project is loaded before the
  // first question rather than during it.
  warm(paths: readonly string[]): Promise<void>
  stop(): Promise<void>
}

interface Running {
  name: string
  rpc: RpcConnection
  child: ChildProcessWithoutNullStreams
  documents: Map<string, { version: number; text: string }>
  lastUsed: number
}

const DEFAULT_IDLE_MS = 10 * 60_000
const FAILED_RETRY_MS = 60_000
const NONE: LspLocations = { source: null, server: null, locations: [] }

export function createLspPool(repo: string, options: LspPoolOptions = {}): LspPool {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS
  const specs = options.servers ?? SERVERS
  const running = new Map<string, Running>()
  const failed = new Map<string, number>()
  const starting = new Map<string, Promise<Running | null>>()
  const rootUri = pathToFileURL(repo).href

  const sweep = setInterval(
    () => {
      const now = Date.now()
      for (const server of running.values()) if (now - server.lastUsed > idleMs) void close(server)
    },
    Math.min(idleMs, 60_000),
  )
  sweep.unref?.()

  async function close(server: Running): Promise<void> {
    running.delete(server.name)
    if (server.rpc.alive) {
      await server.rpc.request('shutdown', null, 2000).catch(() => {})
      server.rpc.notify('exit', null)
    }
    setTimeout(() => server.child.kill(), 500).unref?.()
  }

  async function launch(spec: ServerSpec, command: string[]): Promise<Running | null> {
    const [program, ...args] = command as [string, ...string[]]
    const child = spawn(program, args, { cwd: repo, env: options.env ?? process.env, stdio: 'pipe' })
    const folders = [{ uri: rootUri, name: basename(repo) }]
    const rpc = new RpcConnection(child, (method, params) => {
      if (method === 'workspace/configuration') return ((params as { items?: unknown[] })?.items ?? []).map(() => null)
      if (method === 'workspace/workspaceFolders') return folders
      return null
    })
    try {
      await rpc.request(
        'initialize',
        {
          processId: process.pid,
          rootUri,
          rootPath: repo,
          workspaceFolders: folders,
          clientInfo: { name: 'duck-diff' },
          capabilities: {
            general: { positionEncodings: ['utf-16'] },
            textDocument: {
              synchronization: { didSave: false },
              definition: { linkSupport: true },
              references: {},
              hover: { contentFormat: ['markdown', 'plaintext'] },
            },
            workspace: { configuration: true, workspaceFolders: true },
          },
        },
        30_000,
      )
    } catch {
      child.kill()
      return null
    }
    rpc.notify('initialized', {})
    return { name: spec.name, rpc, child, documents: new Map(), lastUsed: Date.now() }
  }

  function start(spec: ServerSpec): Promise<Running | null> {
    const existing = running.get(spec.name)
    if (existing?.rpc.alive) return Promise.resolve(existing)
    if (existing) running.delete(spec.name)
    const pending = starting.get(spec.name)
    if (pending) return pending
    if (Date.now() - (failed.get(spec.name) ?? 0) < FAILED_RETRY_MS) return Promise.resolve(null)
    const next = (async () => {
      for (const command of candidates(spec, options.env)) {
        const server = await launch(spec, command)
        if (server) {
          running.set(spec.name, server)
          return server
        }
      }
      failed.set(spec.name, Date.now())
      return null
    })().finally(() => starting.delete(spec.name))
    starting.set(spec.name, next)
    return next
  }

  async function sourceText(path: string, ref: string | null): Promise<string | null> {
    if (ref === null) return readFile(join(repo, path), 'utf8').catch(() => null)
    return (await readTreeFile(repo, ref, path))?.text ?? null
  }

  // A commit's version of a file is shown to the server as an edit of the working file, so the rest of
  // the project still resolves around it without checking anything out.
  async function sync(server: Running, uri: string, languageId: string, text: string): Promise<void> {
    const open = server.documents.get(uri)
    if (!open) {
      server.documents.set(uri, { version: 1, text })
      server.rpc.notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } })
    } else if (open.text !== text) {
      open.version++
      open.text = text
      server.rpc.notify('textDocument/didChange', {
        textDocument: { uri, version: open.version },
        contentChanges: [{ text }],
      })
    }
  }

  async function ask(
    method: string,
    query: LspQuery,
    extra: object = {},
  ): Promise<{ server: Running; result: unknown; text: string } | null> {
    const found = specFor(query.path, specs)
    if (!found) return null
    const server = await start(found.spec)
    if (!server) return null
    server.lastUsed = Date.now()
    const text = await sourceText(query.path, query.ref ?? null)
    if (text === null) return null
    const uri = pathToFileURL(join(repo, query.path)).href
    await sync(server, uri, found.languageId, text)
    const result = await server.rpc
      .request(method, {
        textDocument: { uri },
        position: { line: query.line - 1, character: query.column - 1 },
        ...extra,
      })
      .catch(() => undefined)
    if (result === undefined) return null
    return { server, result, text }
  }

  async function locations(method: string, query: LspQuery, extra?: object): Promise<LspLocations> {
    const answer = await ask(method, query, extra)
    if (!answer) return NONE
    const readLines = async (path: string) =>
      (path === query.path ? answer.text : await sourceText(path, null))?.split('\n') ?? null
    const out = await resolveLocations(repo, toLocations(answer.result), readLines)
    return { source: 'server', server: answer.server.name, locations: out }
  }

  return {
    definition: (query) => locations('textDocument/definition', query),
    references: (query) => locations('textDocument/references', query, { context: { includeDeclaration: true } }),
    async hover(query) {
      const answer = await ask('textDocument/hover', query)
      if (!answer) return { source: null, server: null, contents: null }
      const contents = hoverText((answer.result as { contents?: unknown } | null)?.contents)
      return { source: 'server', server: answer.server.name, contents }
    },
    running: () => [...running.keys()],
    ready(path) {
      const found = specFor(path, specs)
      return Boolean(found && running.get(found.spec.name)?.rpc.alive)
    },
    async warm(paths) {
      const first = new Map<string, { path: string; languageId: string; spec: ServerSpec }>()
      for (const path of paths) {
        const found = specFor(path, specs)
        if (found && !first.has(found.spec.name)) first.set(found.spec.name, { path, ...found })
      }
      await Promise.all(
        [...first.values()].map(async ({ path, languageId, spec }) => {
          const server = await start(spec)
          const text = server ? await sourceText(path, null) : null
          if (!server || text === null) return
          server.lastUsed = Date.now()
          await sync(server, pathToFileURL(join(repo, path)).href, languageId, text)
        }),
      )
    },
    async stop() {
      clearInterval(sweep)
      await Promise.all([...running.values()].map(close))
    },
  }
}
