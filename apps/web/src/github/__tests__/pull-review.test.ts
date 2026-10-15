import { describe, expect, it, vi } from 'vitest'
import type { GitHubApi } from '../../lib/api'
import { fakeApi } from '../../test/fake-api'
import { createPullReview, pullOf } from '../pull-review'

function api(overrides: Partial<GitHubApi>) {
  const base = fakeApi().github
  return fakeApi({
    github: {
      ...base,
      pull: async () => ({ reviewComments: [] }) as never,
      reviewState: async () => ({
        threads: [{ id: 'T1', resolved: false, outdated: false, root: 5 }],
        viewed: ['a.ts'],
      }),
      ...overrides,
    },
  })
}

describe('pull review', () => {
  it('reads which pull request a diff target shows', () => {
    expect(pullOf({ kind: 'range', from: 'origin/main', to: 'refs/duck-diff/pr/12', mode: 'merge-base' })).toBe(12)
    expect(pullOf({ kind: 'local' })).toBeNull()
  })

  it('gathers comments and sends them with the review, then empties the list', async () => {
    const review = vi.fn(async () => {})
    const store = createPullReview(api({ review }))
    await store.load(7)
    expect(store.get().viewed).toEqual(new Set(['a.ts']))
    store.addPending({ path: 'a.ts', line: 3, side: 'RIGHT', body: 'nit' })
    store.addPending({ path: 'b.ts', line: 1, side: 'LEFT', body: 'why' })
    store.removePending(1)
    await store.submit('REQUEST_CHANGES', 'please')
    expect(review).toHaveBeenCalledWith(7, 'REQUEST_CHANGES', 'please', [
      { path: 'a.ts', line: 3, side: 'RIGHT', body: 'nit' },
    ])
    expect(store.get().pending).toEqual([])
  })

  it('resolves a thread by its first comment', async () => {
    const resolveThread = vi.fn(async () => {})
    const store = createPullReview(api({ resolveThread }))
    await store.load(7)
    await store.resolve(5, true)
    expect(resolveThread).toHaveBeenCalledWith(7, 'T1', true)
    expect(store.get().threads.get(5)?.resolved).toBe(true)
  })
})
