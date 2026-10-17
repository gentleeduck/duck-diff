import type { ReviewComment } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
