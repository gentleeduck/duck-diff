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

  it('keeps a review not sent yet across a restart, per repository and pull request, until it is sent', async () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    }
    const before = createPullReview(api({}), undefined, storage)
    before.restore('/repo')
    await before.load(7)
    before.addPending({ path: 'a.ts', line: 3, side: 'RIGHT', body: 'nit' })

    const after = createPullReview(api({}), undefined, storage)
    after.restore('/repo')
    await after.load(7)
    expect(after.get().pending).toEqual([{ path: 'a.ts', line: 3, side: 'RIGHT', body: 'nit' }])
    // Another pull request, or the same number in another repository, starts empty.
    await after.load(8)
    expect(after.get().pending).toEqual([])
    const elsewhere = createPullReview(api({}), undefined, storage)
    elsewhere.restore('/other')
    await elsewhere.load(7)
    expect(elsewhere.get().pending).toEqual([])

    await after.load(7)
    await after.submit('COMMENT', '')
    expect(data.size).toBe(0)
  })

  it('resolves a thread by its first comment', async () => {
    const resolveThread = vi.fn(async () => {})
    const store = createPullReview(api({ resolveThread }))
    await store.load(7)
    await store.resolve(5, true)
    expect(resolveThread).toHaveBeenCalledWith(7, 'T1', true)
    expect(store.get().threads.get(5)?.resolved).toBe(true)
  })

  it('edits and deletes a posted line comment, here and on GitHub', async () => {
    const comment = {
      id: 9,
      author: { login: 'me', avatarUrl: '' },
      body: 'old',
      createdAt: 'now',
      path: 'a.ts',
      line: 3,
      startLine: null,
      side: 'RIGHT' as const,
      inReplyTo: null,
      reviewId: null,
    }
    const editReviewComment = vi.fn(async () => {})
    const deleteReviewComment = vi.fn(async () => {})
    const store = createPullReview(
      api({ pull: async () => ({ reviewComments: [comment] }) as never, editReviewComment, deleteReviewComment }),
    )
    await store.load(7)
    await store.edit(9, 'new')
    expect(editReviewComment).toHaveBeenCalledWith(9, 'new')
    expect(store.get().comments[0]?.body).toBe('new')
    await store.remove(9)
    expect(deleteReviewComment).toHaveBeenCalledWith(9)
    expect(store.get().comments).toEqual([])
  })

  it('takes an edited or deleted suggestion out of the batch, so a batch commit never asks for it', async () => {
    const suggestion = (id: number) => ({
      id,
      author: { login: 'me', avatarUrl: '' },
      body: '```suggestion\nx\n```',
      createdAt: 'now',
      path: 'a.ts',
      line: id,
      startLine: null,
      side: 'RIGHT' as const,
      inReplyTo: null,
      reviewId: null,
    })
    const store = createPullReview(
      api({ pull: async () => ({ reviewComments: [suggestion(1), suggestion(2), suggestion(3)] }) as never }),
    )
    await store.load(7)
    for (const id of [1, 2, 3]) store.toggleBatch(id)
    await store.edit(1, 'no longer a suggestion')
    await store.remove(2)
    expect(store.get().batch).toEqual([3])
  })
})
