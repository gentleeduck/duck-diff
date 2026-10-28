import { describe, expect, it } from 'vitest'
import { FILES, fakeApi, PATCH } from '../../test/fake-api'
import { createSession } from '../session'

describe('session', () => {
  it('draws the diff that came with the page before asking for anything', () => {
    let asked = 0
    const api = fakeApi({
      files: async () => {
        asked++
        return FILES
      },
    })
    const session = createSession(api, { kind: 'local' }, { key: 'local', files: FILES, patch: PATCH })
    expect(session.get().status).toBe('ready')
    expect(session.get().items.map((item) => item.id)).toEqual(['diff:a.ts', 'diff:b.ts'])
    expect(session.get().items[0]?.fileDiff.cacheKey).toBe('a.ts:1:2')
    expect(asked).toBe(0)
    // A seed for another comparison is not this one.
    expect(createSession(api, { kind: 'staged' }, { key: 'local', files: FILES, patch: PATCH }).get().status).toBe(
      'idle',
    )
  })

  it('loads files and items for a target', async () => {
    const session = createSession(fakeApi(), { kind: 'local' })
    await session.load({ kind: 'staged' })
    const state = session.get()
    expect(state.status).toBe('ready')
    expect(state.target).toEqual({ kind: 'staged' })
    expect(state.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts'])
    expect(state.items.map((i) => i.id)).toEqual(['diff:a.ts', 'diff:b.ts'])
    expect(state.items[0]?.fileDiff.cacheKey).toBe('a.ts:1:2')
  })

  it('reports errors', async () => {
    const session = createSession(
      fakeApi({
        files: async () => {
          throw new Error('boom')
        },
      }),
      { kind: 'local' },
    )
    await session.load({ kind: 'local' })
    expect(session.get()).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('shows no files for a comparison that fails, rather than the files of the one before', async () => {
    const session = createSession(
      fakeApi({
        files: async (target) => {
          if (target.kind === 'staged') throw new Error('nope is not a branch, tag or commit in this repo')
          return FILES
        },
      }),
      { kind: 'local' },
    )
    await session.load({ kind: 'local' })
    expect(session.get().files.length).toBe(2)
    await session.load({ kind: 'staged' })
    expect(session.get()).toMatchObject({ status: 'error', files: [], items: [] })
  })

  it('drops a load that a newer load replaced', async () => {
    let release: () => void = () => {}
    const slow = new Promise<void>((resolve) => {
      release = resolve
    })
    const session = createSession(
      fakeApi({
        files: async (target) => {
          if (target.kind === 'staged') await slow
          return target.kind === 'staged' ? [] : FILES
        },
      }),
      { kind: 'local' },
    )
    const first = session.load({ kind: 'staged' })
    await session.load({ kind: 'unstaged' })
    release()
    await first
    expect(session.get().target).toEqual({ kind: 'unstaged' })
    expect(session.get().files.length).toBe(2)
  })
  it('publishes items while the stream is still arriving', async () => {
    const encoder = new TextEncoder()
    let push: (text: string) => void = () => {}
    let end: () => void = () => {}
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (text) => controller.enqueue(encoder.encode(text))
        end = () => controller.close()
      },
    })
    const session = createSession(fakeApi({ diff: async () => body }), { kind: 'local' })
    const seen: number[] = []
    session.subscribe(() => seen.push(session.get().items.length))
    const loading = session.load({ kind: 'local' })
    const [first = '', second = ''] = PATCH.split(/(?=diff --git a\/b)/)
    await new Promise((resolve) => setTimeout(resolve, 0))
    push(first)
    push(second.slice(0, 12))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(session.get().streaming).toBe(true)
    expect(session.get().items.map((i) => i.id)).toEqual(['diff:a.ts'])
    push(second.slice(12))
    end()
    await loading
    expect(session.get().streaming).toBe(false)
    expect(session.get().items.map((i) => i.id)).toEqual(['diff:a.ts', 'diff:b.ts'])
    expect(seen.some((count) => count === 1)).toBe(true)
  })
  it('keeps unchanged items identical across a reload so the viewer skips them', async () => {
    let files = FILES
    const session = createSession(fakeApi({ files: async () => files }), { kind: 'local' })
    await session.load({ kind: 'local' })
    const [a1, b1] = session.get().items
    files = FILES.map((file) => (file.path === 'b.ts' ? { ...file, newSha: '3' } : file))
    await session.reload()
    const [a2, b2] = session.get().items
    expect(a2).toBe(a1)
    expect(b2).not.toBe(b1)
  })
})

describe('session cache', () => {
  function counting() {
    const asked: string[] = []
    const api = fakeApi({
      files: async (target) => {
        asked.push(target.kind === 'commit' ? `commit:${target.sha}` : target.kind)
        return FILES
      },
    })
    return { asked, api }
  }

  it('shows a commit seen before at once and never reads it again', async () => {
    const { asked, api } = counting()
    const session = createSession(api, { kind: 'local' })
    await session.load({ kind: 'local' })
    await session.load({ kind: 'commit', sha: 'abc1234' })
    const first = session.get().items
    await session.load({ kind: 'local' })
    const back = session.load({ kind: 'commit', sha: 'abc1234' })
    // Ready before the promise settles: nothing is fetched.
    expect(session.get()).toMatchObject({ status: 'ready', target: { kind: 'commit', sha: 'abc1234' } })
    expect(session.get().items).toBe(first)
    await back
    expect(asked.filter((entry) => entry === 'commit:abc1234')).toHaveLength(1)
  })

  it('shows the working tree from memory, then refreshes it in one step', async () => {
    const { asked, api } = counting()
    const session = createSession(api, { kind: 'local' })
    await session.load({ kind: 'local' })
    await session.load({ kind: 'commit', sha: 'abc1234' })
    const states: string[] = []
    const stop = session.subscribe(() => states.push(`${session.get().status}:${session.get().items.length}`))
    await session.load({ kind: 'local' })
    stop()
    expect(asked.filter((entry) => entry === 'local')).toHaveLength(2)
    // Never loading, never a half list: the cached diff, then the refreshed one.
    expect(states.every((state) => state === 'ready:2')).toBe(true)
  })
})

describe('session prefetch', () => {
  it('reads a diff ahead so opening it later needs nothing', async () => {
    const asked: string[] = []
    const api = fakeApi({
      files: async (target) => {
        asked.push(target.kind)
        return FILES
      },
    })
    const session = createSession(api, { kind: 'local' })
    await session.load({ kind: 'local' })
    session.prefetch({ kind: 'commit', sha: 'abc1234' })
    session.prefetch({ kind: 'local' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(asked).toEqual(['local', 'commit'])
    void session.load({ kind: 'commit', sha: 'abc1234' })
    expect(session.get()).toMatchObject({ status: 'ready', target: { kind: 'commit', sha: 'abc1234' } })
    expect(session.get().items).toHaveLength(2)
    expect(asked).toEqual(['local', 'commit'])
  })
})
