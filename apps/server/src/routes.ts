import { listCommits, listFiles, listRefs, runGit, streamPatch } from '@duck-diff/git'
import { decodeTarget, FileStatusSchema, type RepoInfo } from '@duck-diff/protocol'
import { z } from 'zod'
import { HttpError } from './errors'
import { iterableToStream } from './stream'

export async function repoInfo(repo: string): Promise<RepoInfo> {
  const branch = (await runGit(['branch', '--show-current'], { cwd: repo })).trim() || null
  const head = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  return { root: repo, branch, head: head || null }
}

const PatchQuery = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
  status: FileStatusSchema,
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

export async function handleApi(repo: string, url: URL): Promise<Response> {
  switch (url.pathname) {
    case '/api/repo':
      return Response.json(await repoInfo(repo))
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
    default:
      throw new HttpError(404, 'not-found', `no route ${url.pathname}`)
  }
}
