import { describe, expect, it } from 'vitest'
import { FILES, fakeApi, PATCH } from '../../test/fake-api'
import { createSession } from '../session'

describe('session', () => {
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
})
