import {
  type ChangedFile,
  ChangedFileSchema,
  type Commit,
  CommitSchema,
  type DiffTarget,
  ErrorBodySchema,
  type ErrorCode,
  encodeTarget,
  type Ref,
  RefSchema,
  type RepoInfo,
  RepoInfoSchema,
  type UndoResult,
  UndoResultSchema,
  type WriteRequest,
} from '@duck-diff/protocol'
import { z } from 'zod'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface Api {
  repo(): Promise<RepoInfo>
  refs(): Promise<Ref[]>
  files(target: DiffTarget, signal?: AbortSignal): Promise<ChangedFile[]>
  commits(query: { head: string; base?: string; limit?: number }): Promise<Commit[]>
  diff(target: DiffTarget, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>
  content(target: DiffTarget, side: 'old' | 'new', file: Pick<ChangedFile, 'path' | 'oldPath'>): Promise<string | null>
  open(path: string, line: number): Promise<void>
  write(request: WriteRequest): Promise<void>
  undo(): Promise<UndoResult>
}

const ContentSchema = z.object({ contents: z.string().nullable() })

export function createApi(fetcher: typeof fetch = fetch, base = ''): Api {
  async function request(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<Response> {
    const response = await fetcher(`${base}${path}`, { ...init, signal })
    if (response.ok) return response
    const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null))
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message)
    throw new ApiError(response.status, 'failed', `request failed with ${response.status}`)
  }

  async function json<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    return schema.parse(await (await request(path, signal)).json())
  }

  return {
    repo: () => json('/api/repo', RepoInfoSchema),
    refs: () => json('/api/refs', z.array(RefSchema)),
    files: (target, signal) => json(`/api/files?target=${encodeTarget(target)}`, z.array(ChangedFileSchema), signal),
    commits(query) {
      const params = new URLSearchParams({ head: query.head })
      if (query.base) params.set('base', query.base)
      if (query.limit) params.set('limit', String(query.limit))
      return json(`/api/commits?${params}`, z.array(CommitSchema))
    },
    async diff(target, signal) {
      const response = await request(`/api/diff?target=${encodeTarget(target)}`, signal)
      if (!response.body) throw new ApiError(500, 'failed', 'empty diff body')
      return response.body
    },
    async content(target, side, file) {
      const params = new URLSearchParams({ side, path: file.path })
      if (file.oldPath) params.set('oldPath', file.oldPath)
      const body = await json(`/api/content?target=${encodeTarget(target)}&${params}`, ContentSchema)
      return body.contents
    },
    async write(body) {
      await request('/api/write', undefined, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    async undo() {
      return UndoResultSchema.parse(await (await request('/api/undo', undefined, { method: 'POST' })).json())
    },
    async open(path, line) {
      await request('/api/open', undefined, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, line }),
      })
    },
  }
}
