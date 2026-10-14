import { encodeTarget } from '@duck-diff/protocol'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApi } from '../api'

function respond(body: unknown, init: ResponseInit = {}) {
  return vi.fn(async () =>
    typeof body === 'string' ? new Response(body, init) : Response.json(body, init),
  ) as unknown as typeof fetch
}

const file = {
  path: 'a.ts',
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
  oldSha: 'a',
  newSha: 'b',
}

describe('createApi', () => {
  it('fetches and validates files for a target', async () => {
    const fetcher = respond([file])
    const api = createApi(fetcher)
    expect(await api.files({ kind: 'unstaged' })).toEqual([file])
    expect(vi.mocked(fetcher).mock.calls[0]?.[0]).toBe(`/api/files?target=${encodeTarget({ kind: 'unstaged' })}`)
  })

  it('rejects bodies that do not match the schema', async () => {
    const api = createApi(respond([{ path: 1 }]))
    await expect(api.files({ kind: 'unstaged' })).rejects.toThrow()
  })

  it('turns error bodies into ApiError', async () => {
    const api = createApi(respond({ error: { code: 'unknown-ref', message: 'no such ref' } }, { status: 400 }))
    const error = await api.refs().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'unknown-ref', message: 'no such ref' })
  })

  it('returns the diff body stream', async () => {
    const api = createApi(respond('diff --git a/x b/x\n'))
    const stream = await api.diff({ kind: 'staged' })
    expect(await new Response(stream).text()).toBe('diff --git a/x b/x\n')
  })

  it('requests content with side, path and old path', async () => {
    const fetcher = respond({ contents: 'hi' })
    const api = createApi(fetcher)
    expect(await api.content({ kind: 'staged' }, 'old', { path: 'b.ts', oldPath: 'a.ts' })).toBe('hi')
    const url = String(vi.mocked(fetcher).mock.calls[0]?.[0])
    expect(url).toContain('side=old')
    expect(url).toContain('path=b.ts')
    expect(url).toContain('oldPath=a.ts')
  })
  it('posts open requests', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch
    await createApi(fetcher).open('src/a.ts', 7)
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? []
    expect(url).toBe('/api/open')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ path: 'src/a.ts', line: 7 }) })
  })
})
