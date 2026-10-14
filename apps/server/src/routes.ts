import { listCommits, listFiles, listRefs, readSide, runGit, streamDiff, streamPatch } from '@duck-diff/git'
import { decodeTarget, FileStatusSchema, type RepoInfo } from '@duck-diff/protocol'
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
})

function requireTarget(url: URL) {
  const raw = url.searchParams.get('target')
  if (!raw) throw new HttpError(400, 'bad-request', 'missing target')
  return decodeTarget(raw)
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
      const path = query.side === 'old' ? (query.oldPath ?? query.path) : query.path
      return Response.json({ contents: await readSide(repo, target, query.side, path) })
    }
    default:
      throw new HttpError(404, 'not-found', `no route ${url.pathname}`)
  }
}
