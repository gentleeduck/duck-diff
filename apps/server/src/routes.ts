import {
  findSymbol,
  graphTips,
  listCommits,
  listFiles,
  listRefs,
  listSubmodules,
  listTree,
  listWorktrees,
  readBisect,
  readCommit,
  readCommitStat,
  readConflict,
  readInsights,
  readSide,
  readSideBytes,
  readTreeBytes,
  readTreeFile,
  rebasePlan,
  runGit,
  streamDiff,
  streamGraph,
  streamPatch,
  submoduleLog,
} from '@duck-diff/git'
import {
  decodeTarget,
  FileStatusSchema,
  InsightsQuerySchema,
  RefNameSchema,
  type RepoInfo,
  RepoPathSchema,
  SubmoduleLogQuerySchema,
  SymbolQuerySchema,
  targetKey,
} from '@duck-diff/protocol'
import { z } from 'zod'
import type { DiskCache } from './disk-cache'
import { HttpError } from './errors'
import type { RepoMemo } from './memo'
import { iterableToStream } from './stream'

export async function repoInfo(repo: string, nvim = false, build?: string): Promise<RepoInfo> {
  const branch = (await runGit(['branch', '--show-current'], { cwd: repo })).trim() || null
  const head = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  return { root: repo, branch, head: head || null, nvim, ...(build ? { build } : {}) }
}

const PatchQuery = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
  status: FileStatusSchema,
})

const ContentQuery = z.object({
  side: z.enum(['old', 'new']),
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
})

const CommitsQuery = z.object({
  head: z.string().min(1),
  base: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(5000).optional(),
  path: RepoPathSchema.optional(),
})

// Images the diff and README previews show.
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

// Without a ref the tree is the working tree.
const TreeQuery = z.object({ ref: RefNameSchema.optional() })

const GraphQuery = z.object({
  all: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().positive().max(100_000).default(5000),
})

function requireTarget(url: URL) {
  const raw = url.searchParams.get('target')
  if (!raw) throw new HttpError(400, 'bad-request', 'missing target')
  return decodeTarget(raw)
}

// Reads are limited to files git reports for the target, so the query cannot reach arbitrary paths.
async function sideQuery(repo: string, url: URL) {
  const target = requireTarget(url)
  const query = ContentQuery.parse({
    side: url.searchParams.get('side'),
    path: url.searchParams.get('path'),
    oldPath: url.searchParams.get('oldPath'),
  })
  const changed = await listFiles(repo, target)
  const entry = changed.find((candidate) => candidate.path === query.path)
  if (!entry || (query.oldPath !== null && query.oldPath !== entry.oldPath)) {
    throw new HttpError(400, 'bad-request', 'file is not part of this diff')
  }
  return { target, side: query.side, path: query.side === 'old' ? (query.oldPath ?? query.path) : query.path }
}

const FULL_SHA = /^[0-9a-f]{40}$/
// Graph text above this is read again each time rather than kept.
const GRAPH_KEEP_BYTES = 8 * 1024 * 1024

// A commit never changes, so what was read for its full sha is kept for good.
async function once<T>(cache: DiskCache | undefined, bucket: string, sha: string, read: () => Promise<T>): Promise<T> {
  if (!cache || !FULL_SHA.test(sha)) return read()
  const kept = await cache.get<T>(bucket, sha)
  if (kept !== null) return kept
  const value = await read()
  cache.set(bucket, sha, value)
  return value
}

async function* remembering(source: AsyncIterable<string>, done: (text: string) => void): AsyncIterable<string> {
  let text = ''
  for await (const chunk of source) {
    if (text.length < GRAPH_KEEP_BYTES) text += chunk
    yield chunk
  }
  // Only a graph read to its end is kept; a page that left early leaves nothing half written.
  if (text.length < GRAPH_KEEP_BYTES) done(text)
}

export async function handleApi(
  repo: string,
  url: URL,
  nvim = false,
  build?: string,
  cache?: DiskCache,
  memo?: RepoMemo,
): Promise<Response> {
  switch (url.pathname) {
    case '/api/repo':
      return Response.json(await repoInfo(repo, nvim, build))
    case '/api/refs': {
      const kept = memo?.get('refs')
      if (kept !== undefined) return new Response(kept, { headers: { 'content-type': 'application/json' } })
      const stamp = memo?.stamp() ?? 0
      const text = JSON.stringify(await listRefs(repo))
      memo?.set('refs', text, stamp)
      return new Response(text, { headers: { 'content-type': 'application/json' } })
    }
    case '/api/files': {
      const target = requireTarget(url)
      const key = `files:${targetKey(target)}`
      const kept = memo?.get(key)
      if (kept !== undefined) return new Response(kept, { headers: { 'content-type': 'application/json' } })
      const stamp = memo?.stamp() ?? 0
      const text = JSON.stringify(await listFiles(repo, target))
      memo?.set(key, text, stamp)
      return new Response(text, { headers: { 'content-type': 'application/json' } })
    }
    case '/api/commits': {
      const query = CommitsQuery.parse(Object.fromEntries(url.searchParams))
      return Response.json(await listCommits(repo, query))
    }
    case '/api/tree': {
      const { ref } = TreeQuery.parse(Object.fromEntries(url.searchParams))
      return Response.json(await listTree(repo, ref ?? null))
    }
    case '/api/rebase-plan': {
      const { base } = z.object({ base: RefNameSchema }).parse(Object.fromEntries(url.searchParams))
      return Response.json(await rebasePlan(repo, base))
    }
    case '/api/insights': {
      const { days } = InsightsQuerySchema.parse(Object.fromEntries(url.searchParams))
      return Response.json(await readInsights(repo, { since: Math.floor(Date.now() / 1000) - days * 86_400 }))
    }
    case '/api/worktrees':
      return Response.json(await listWorktrees(repo))
    case '/api/submodules':
      return Response.json(await listSubmodules(repo))
    case '/api/submodule-log': {
      const { path, from, to } = SubmoduleLogQuerySchema.parse(Object.fromEntries(url.searchParams))
      return Response.json(await submoduleLog(repo, path, from ?? null, to))
    }
    case '/api/bisect':
      return Response.json(await readBisect(repo))
    case '/api/conflict': {
      const { path } = z.object({ path: RepoPathSchema }).parse(Object.fromEntries(url.searchParams))
      return Response.json(await readConflict(repo, path))
    }
    case '/api/symbols': {
      const { name, ref } = SymbolQuerySchema.parse(Object.fromEntries(url.searchParams))
      return Response.json(await findSymbol(repo, name, ref ?? null))
    }
    case '/api/raw': {
      const { ref, path } = TreeQuery.extend({ path: RepoPathSchema }).parse(Object.fromEntries(url.searchParams))
      const type = IMAGE_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()]
      if (!type) throw new HttpError(415, 'bad-request', `${path} is not an image`)
      const read = await readTreeBytes(repo, ref ?? null, path)
      if (!read?.bytes) throw new HttpError(404, 'not-found', `no image ${path}`)
      return new Response(new Uint8Array(read.bytes), {
        headers: {
          'content-type': type,
          'cache-control': 'private, max-age=60',
          'x-content-type-options': 'nosniff',
          // An SVG opened on its own must not run script with this page's access.
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      })
    }
    case '/api/file': {
      const { ref, path } = TreeQuery.extend({ path: RepoPathSchema }).parse(Object.fromEntries(url.searchParams))
      const contents = await readTreeFile(repo, ref ?? null, path)
      if (!contents) throw new HttpError(404, 'not-found', `no file ${path}`)
      return Response.json(contents)
    }
    case '/api/commit-stat': {
      const { sha } = z.object({ sha: RefNameSchema }).parse(Object.fromEntries(url.searchParams))
      return Response.json(await once(cache, 'commit-stats', sha, () => readCommitStat(repo, sha)))
    }
    case '/api/commit': {
      const { sha } = z.object({ sha: RefNameSchema }).parse(Object.fromEntries(url.searchParams))
      return Response.json(await once(cache, 'commits', sha, () => readCommit(repo, sha)))
    }
    case '/api/graph': {
      const query = GraphQuery.parse(Object.fromEntries(url.searchParams))
      const all = query.all !== 'false'
      const headers = { 'content-type': 'text/plain; charset=utf-8' }
      // The same refs give the same graph, so a page opened again draws it from disk without walking history.
      const key = `${all}:${query.limit}`
      // Held in memory until the repo changes; on disk, by the tips it was drawn from.
      const held = memo?.get(`graph:${key}`)
      if (held !== undefined) return new Response(held, { headers })
      const stamp = memo?.stamp() ?? 0
      const hold = (text: string) => memo?.set(`graph:${key}`, text, stamp)
      const tips = cache ? Bun.hash(await graphTips(repo, all)).toString(36) : ''
      const kept = cache ? await cache.get<{ tips: string; text: string }>('graph', key) : null
      if (kept?.tips === tips) {
        hold(kept.text)
        return new Response(kept.text, { headers })
      }
      const stream = streamGraph(repo, { all, limit: query.limit })
      return new Response(
        iterableToStream(
          remembering(stream, (text) => {
            hold(text)
            if (cache) cache.set('graph', key, { tips, text })
          }),
        ),
        { headers },
      )
    }
    case '/api/patch': {
      const target = requireTarget(url)
      const file = PatchQuery.parse({
        path: url.searchParams.get('path'),
        oldPath: url.searchParams.get('oldPath'),
        status: url.searchParams.get('status'),
      })
      // Only paths git reports for this target are served, so the query cannot read arbitrary files.
      const changed = await listFiles(repo, target)
      if (!changed.some((entry) => entry.path === file.path && entry.oldPath === file.oldPath)) {
        throw new HttpError(400, 'bad-request', 'file is not part of this diff')
      }
      return new Response(iterableToStream(streamPatch(repo, target, file)), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    case '/api/diff': {
      const target = requireTarget(url)
      const headers = { 'content-type': 'text/plain; charset=utf-8' }
      const key = `diff:${targetKey(target)}`
      const kept = memo?.get(key)
      if (kept !== undefined) return new Response(kept, { headers })
      const stamp = memo?.stamp() ?? 0
      const stream = streamDiff(repo, target)
      return new Response(iterableToStream(memo ? remembering(stream, (text) => memo.set(key, text, stamp)) : stream), {
        headers,
      })
    }
    case '/api/content': {
      const { target, side, path } = await sideQuery(repo, url)
      return Response.json({ contents: await readSide(repo, target, side, path) })
    }
    case '/api/blob': {
      const { target, side, path } = await sideQuery(repo, url)
      const type = IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? '']
      if (!type) throw new HttpError(400, 'bad-request', 'only images are served as files')
      const bytes = await readSideBytes(repo, target, side, path)
      if (!bytes) throw new HttpError(404, 'not-found', 'no such file on this side')
      if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'bad-request', 'image is too large to preview')
      // An svg can carry script; sandboxing keeps it inert even if opened directly.
      return new Response(new Uint8Array(bytes), {
        headers: {
          'content-type': type,
          'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
          'x-content-type-options': 'nosniff',
        },
      })
    }
    default:
      throw new HttpError(404, 'not-found', `no route ${url.pathname}`)
  }
}
