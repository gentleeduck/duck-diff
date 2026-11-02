import type { ReviewComment } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { fakeApi } from '../../test/fake-api'

const comment: ReviewComment = {
  id: 'n1',
  target: { kind: 'local' },
  path: 'a.ts',
  side: 'additions',
  line: 1,
  lineHash: 'h',
  body: 'Rename this',
  createdAt: 1,
  updatedAt: 1,
}

describe('comments panel', () => {
  it('copies every comment on the comparison as one prompt for an AI', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const reviewPrompt = vi.fn(async () => 'all of them')
    render(<App api={fakeApi({ reviews: async () => [comment], reviewPrompt })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comments' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy all as prompt' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('all of them'))
    expect(reviewPrompt).toHaveBeenCalledWith({ kind: 'local' })
  })

  it('deletes a comment from the list, even one on a file no longer in the diff', async () => {
    const deleteReview = vi.fn(async () => {})
    const gone: ReviewComment = { ...comment, id: 'n2', path: 'removed.ts', body: 'Stale note' }
    render(<App api={fakeApi({ reviews: async () => [gone], deleteReview })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comments' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment on removed.ts' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete comment' })
    expect(deleteReview).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteReview).toHaveBeenCalledWith('n2'))
  })

  it('lists comments whose branch is gone, and moves them to this branch', async () => {
    const adoptReviews = vi.fn(async () => {})
    const orphan = { ...comment, id: 'o1', body: 'Left on feat', branches: ['feat'], missing: ['feat'] }
    render(<App api={fakeApi({ reviewOverview: async () => ({ counts: {}, orphaned: [orphan] }), adoptReviews })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comments, 1 from a deleted branch' }))
    const group = await screen.findByRole('region', { name: 'From deleted branches' })
    expect(within(group).getByText('Left on feat')).toBeTruthy()
    expect(within(group).getByText('feat')).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: 'Move to main' }))
    await waitFor(() => expect(adoptReviews).toHaveBeenCalledWith(['o1']))
  })

  it('clears the orphaned comments it asked about', async () => {
    const clearOrphanedReviews = vi.fn(async () => {})
    const orphan = { ...comment, id: 'o1', branches: ['feat'], missing: ['feat'] }
    render(
      <App
        api={fakeApi({
          reviewOverview: async () => ({ counts: {}, orphaned: [orphan, { ...orphan, id: 'o2' }] }),
          clearOrphanedReviews,
        })}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Comments, 2 from deleted branches' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 orphaned comments' })
    expect(clearOrphanedReviews).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(clearOrphanedReviews).toHaveBeenCalledWith(['o1', 'o2']))
  })

  it('says on the button when comments are waiting from a deleted branch', async () => {
    const orphan = { ...comment, id: 'o1', branches: ['feat'], missing: ['feat'] }
    render(<App api={fakeApi({ reviewOverview: async () => ({ counts: {}, orphaned: [orphan] }) })} />)
    expect(await screen.findByRole('button', { name: 'Comments, 1 from a deleted branch' })).toBeTruthy()
  })
})
