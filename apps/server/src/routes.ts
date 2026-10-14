import {
  listCommits,
  listFiles,
  listRefs,
  readSide,
  readSideBytes,
  runGit,
  streamDiff,
  streamPatch,
} from '@duck-diff/git'
import { decodeTarget, FileStatusSchema, type RepoInfo, RepoPathSchema } from '@duck-diff/protocol'
import { z } from 'zod'
import { HttpError } from './errors'
import { iterableToStream } from './stream'

export async function repoInfo(repo: string, nvim = false): Promise<RepoInfo> {
  const branch = (await runGit(['branch', '--show-current'], { cwd: repo })).trim() || null
  const head = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  return { root: repo, branch, head: head || null, nvim }
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

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

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

export async function handleApi(repo: string, url: URL, nvim = false): Promise<Response> {
  switch (url.pathname) {
    case '/api/repo':
      return Response.json(await repoInfo(repo, nvim))
    case '/api/refs':
      return Response.json(await listRefs(repo))
    case '/api/files':
      return Response.json(await listFiles(repo, requireTarget(url)))
    case '/api/commits': {
      const query = CommitsQuery.parse(Object.fromEntries(url.searchParams))
      return Response.json(await listCommits(repo, query))
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
      return new Response(iterableToStream(streamDiff(repo, target)), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
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
