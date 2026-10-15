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
  it('posts open requests and reads how the file was opened', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ how: 'terminal', command: 'nvim +7 -- src/a.ts' }),
    ) as unknown as typeof fetch
    expect(await createApi(fetcher).open('src/a.ts', 7)).toEqual({ how: 'terminal', command: 'nvim +7 -- src/a.ts' })
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? []
    expect(url).toBe('/api/open')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ path: 'src/a.ts', line: 7 }) })
  })

  it('lists, creates, edits and deletes review comments', async () => {
    const comment = {
      id: 'c 1',
      target: { kind: 'unstaged' },
      path: 'a.ts',
      side: 'additions',
      line: 1,
      lineHash: 'h',
      body: 'note',
      createdAt: 1,
      updatedAt: 1,
    }
    const fetcher = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json(url.includes('target=') ? [comment] : comment),
    ) as unknown as typeof fetch
    const api = createApi(fetcher)
    expect(await api.reviews({ kind: 'unstaged' })).toEqual([comment])
    await api.createReview({ ...comment, target: { kind: 'unstaged' }, side: 'additions' })
    await api.updateReview('c 1', 'better')
    await api.deleteReview('c 1')
    const calls = vi.mocked(fetcher).mock.calls.map(([url, init]) => [init?.method ?? 'GET', url])
    expect(calls).toEqual([
      ['GET', `/api/reviews?target=${encodeTarget({ kind: 'unstaged' })}`],
      ['POST', '/api/reviews'],
      ['PATCH', '/api/reviews/c%201'],
      ['DELETE', '/api/reviews/c%201'],
    ])
  })
})
