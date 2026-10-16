import type { GitHubReviewComment, ReviewComment } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../app/AppProvider'
import { AskDialog } from '../../app/Ask'
import type { Api } from '../../lib/api'
import { fakeApi } from '../../test/fake-api'
import type { Note } from '../annotations'
import { ReviewNote } from '../ReviewNote'

const base = fakeApi()
const me = { login: 'duck', avatarUrl: '' }
const octo = { login: 'octo', avatarUrl: '' }

const onGitHub = (id: number, author: typeof me, body: string): GitHubReviewComment => ({
  id,
  author,
  body,
  createdAt: '2026-10-01T00:00:00Z',
  path: 'a.ts',
  line: 2,
  startLine: null,
  side: 'RIGHT',
  inReplyTo: id === 1 ? null : 1,
  reviewId: null,
})

const local: ReviewComment = {
  id: 'n1',
  target: { kind: 'unstaged' },
  path: 'a.ts',
  side: 'additions',
  line: 2,
  lineHash: 'h',
  body: 'Rename this',
  createdAt: 1,
  updatedAt: 1,
}

function OnPull({ children }: { children: ReactNode }) {
  const { pullReview } = useApp()
  useState(() => pullReview.set((prev) => ({ ...prev, number: 7 })))
  return children
}

function mount(api: Api, note: Note) {
  render(
    <AppProvider api={api}>
      <OnPull>
        <ReviewNote note={note} />
      </OnPull>
      <AskDialog />
    </AppProvider>,
  )
}

async function confirmDelete() {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
}

describe('review notes', () => {
  it('offers edit and delete under a menu on your own GitHub comments only', async () => {
    const editReviewComment = vi.fn(async () => {})
    const deleteReviewComment = vi.fn(async () => {})
    const api: Api = {
      ...base,
      github: {
        ...base.github,
        status: async () => ({ repo: 'o/r', user: me, source: 'gh' }),
        editReviewComment,
        deleteReviewComment,
      },
    }
    mount(api, { kind: 'github', thread: [onGitHub(1, octo, 'Why?'), onGitHub(2, me, 'Because')] })
    const menu = await screen.findByRole('button', { name: "Actions for duck's comment" })
    expect(screen.queryByRole('button', { name: "Actions for octo's comment" })).toBeNull()

    fireEvent.click(menu)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const box = screen.getByRole('textbox', { name: 'Edit comment' }) as HTMLTextAreaElement
    expect(box.value).toBe('Because')
    fireEvent.change(box, { target: { value: 'Because it reads better' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update comment' }))
    await waitFor(() => expect(editReviewComment).toHaveBeenCalledWith(2, 'Because it reads better'))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit comment' })).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: "Actions for duck's comment" }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleteReviewComment).not.toHaveBeenCalled()
    await confirmDelete()
    await waitFor(() => expect(deleteReviewComment).toHaveBeenCalledWith(2))
  })

  it('keeps a local comment under the same menu instead of loose buttons', async () => {
    const updateReview = vi.fn(async (_id: string, body: string) => ({ ...local, body }))
    const deleteReview = vi.fn(async () => {})
    mount({ ...base, updateReview, deleteReview }, { kind: 'comment', comment: local, outdated: false })
    expect(screen.getByText('Rename this')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for your comment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit comment' }), { target: { value: 'Rename it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update comment' }))
    await waitFor(() => expect(updateReview).toHaveBeenCalledWith('n1', 'Rename it'))

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for your comment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await confirmDelete()
    await waitFor(() => expect(deleteReview).toHaveBeenCalledWith('n1'))
  })
})
