import type { ReviewComment } from '@duck-diff/protocol'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { createReviews } from '../reviews'

const comment = (id: string, body = 'note'): ReviewComment => ({
  id,
  target: { kind: 'unstaged' },
  path: 'a.ts',
  side: 'additions',
  line: 1,
  lineHash: 'h',
  body,
  createdAt: 1,
  updatedAt: 1,
})

const DRAFT = { path: 'a.ts', side: 'additions', line: 1, lineHash: 'h' } as const

describe('createReviews', () => {
  it('loads comments for a target and drops answers for a target that is no longer shown', async () => {
    let release: (value: ReviewComment[]) => void = () => {}
    const api = fakeApi({
      reviews: vi.fn((target) =>
        target.kind === 'staged'
          ? new Promise<ReviewComment[]>((resolve) => (release = resolve))
          : Promise.resolve([comment('u')]),
      ),
    })
    const reviews = createReviews(api)
    const slow = reviews.load({ kind: 'staged' })
    await reviews.load({ kind: 'unstaged' })
    release([comment('s')])
    await slow
    expect(reviews.get().comments.map((entry) => entry.id)).toEqual(['u'])
  })

  it('saves the draft as a comment on the current target', async () => {
    const createReview = vi.fn(async (input) => ({ ...input, id: 'new', createdAt: 1, updatedAt: 1 }))
    const reviews = createReviews(fakeApi({ createReview }))
    await reviews.load({ kind: 'unstaged' })
    reviews.startDraft(DRAFT)
    await reviews.save('  looks off  ')
    expect(createReview).toHaveBeenCalledWith({ target: { kind: 'unstaged' }, ...DRAFT, body: 'looks off' })
    expect(reviews.get().draft).toBeNull()
    expect(reviews.get().comments.map((entry) => entry.id)).toEqual(['new'])
  })

  it('keeps the draft when saving fails', async () => {
    const reviews = createReviews(
      fakeApi({
        createReview: async () => {
          throw new Error('offline')
        },
      }),
    )
    await reviews.load({ kind: 'unstaged' })
    reviews.startDraft(DRAFT)
    await expect(reviews.save('x')).rejects.toThrow('offline')
    expect(reviews.get().draft).toEqual(DRAFT)
  })

  it('edits and removes comments', async () => {
    const reviews = createReviews(
      fakeApi({
        reviews: async () => [comment('a'), comment('b')],
        updateReview: async (id, body) => ({ ...comment(id), body }),
      }),
    )
    await reviews.load({ kind: 'unstaged' })
    await reviews.edit('a', 'changed')
    await reviews.remove('b')
    expect(reviews.get().comments).toEqual([{ ...comment('a'), body: 'changed' }])
  })

  it('clears the draft when the target changes', async () => {
    const reviews = createReviews(fakeApi())
    await reviews.load({ kind: 'unstaged' })
    reviews.startDraft(DRAFT)
    await reviews.load({ kind: 'staged' })
    expect(reviews.get().draft).toBeNull()
  })
})
