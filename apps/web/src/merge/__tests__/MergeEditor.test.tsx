import type { ChangedFile, ConflictFile, DiffTarget } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../app/App'
import { fakeApi } from '../../test/fake-api'

const conflicted: ChangedFile = {
  path: 'a.txt',
  oldPath: null,
  status: 'conflicted',
  additions: 0,
  deletions: 0,
  binary: false,
  oldSha: null,
  newSha: null,
}

const file: ConflictFile = {
  path: 'a.txt',
  eol: '\n',
  finalNewline: true,
  stages: { base: null, ours: null, theirs: null },
  segments: [
    { kind: 'common', lines: ['top'] },
    {
      kind: 'conflict',
      ours: ['mine 1'],
      base: null,
      theirs: ['yours 1'],
      oursLabel: 'HEAD',
      baseLabel: null,
      theirsLabel: 'feature',
    },
    { kind: 'common', lines: ['mid'] },
    {
      kind: 'conflict',
      ours: ['mine 2'],
      base: null,
      theirs: ['yours 2'],
      oursLabel: 'HEAD',
      baseLabel: null,
      theirsLabel: 'feature',
    },
  ],
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe('merge editor', () => {
  it('resolves each block its own way and stages the result', async () => {
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    const calls: unknown[][] = []
    const api = fakeApi({
      files: async (target: DiffTarget) => (target.kind === 'unstaged' ? [conflicted] : []),
      conflict: async () => file,
      git: async (action, body) => {
        calls.push([action, body])
        return {}
      },
    })
    render(<App api={api} />)
    const editor = await screen.findByRole('region', { name: 'Merge a.txt' })
    expect(within(editor).getByText('2 of 2 left')).toBeTruthy()
    const resolve = within(editor).getByRole('button', { name: 'Mark resolved' }) as HTMLButtonElement
    expect(resolve.disabled).toBe(true)

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Ours, conflict 1' })).getByRole('button', { name: /Accept ours/ }),
    )
    const second = screen.getByRole('region', { name: 'Result, conflict 2' })
    fireEvent.click(within(second).getByRole('button', { name: 'Both, theirs first' }))
    expect(within(editor).getByText('All resolved')).toBeTruthy()
    expect(within(second).getByText('yours 2')).toBeTruthy()

    fireEvent.click(resolve)
    await waitFor(() =>
      expect(calls).toContainEqual(['resolve-text', { path: 'a.txt', text: 'top\nmine 1\nmid\nyours 2\nmine 2\n' }]),
    )
  })

  it('takes a hand edit for a block', async () => {
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    render(<App api={fakeApi({ conflict: async () => file })} />)
    const first = await screen.findByRole('region', { name: 'Result, conflict 1' })
    fireEvent.click(within(first).getByRole('button', { name: 'Edit conflict 1' }))
    fireEvent.change(within(first).getByRole('textbox', { name: 'Text for conflict 1' }), {
      target: { value: 'merged by hand' },
    })
    fireEvent.click(within(first).getByRole('button', { name: /Use this text/ }))
    expect(within(first).getByText('merged by hand')).toBeTruthy()
    expect(within(first).getByText('Edited')).toBeTruthy()
  })

  it('shows the side taken, and steps the other back', async () => {
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    render(<App api={fakeApi({ conflict: async () => file })} />)
    const ours = await screen.findByRole('region', { name: 'Ours, conflict 1' })
    const accept = within(ours).getByRole('button', { name: /Accept ours/ })
    fireEvent.click(accept)
    expect(accept.getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('region', { name: 'Result, conflict 1' })).getByText('Ours')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Result, conflict 2' })).getByText('Needs a pick')).toBeTruthy()
    const theirs = screen.getByRole('region', { name: 'Theirs, conflict 1' })
    expect(theirs.querySelector('.opacity-40')).not.toBeNull()
  })

  it('names the merge in the top bar and offers Continue once every file is resolved', async () => {
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    const calls: unknown[][] = []
    let left = [conflicted]
    const api = fakeApi({
      files: async (target: DiffTarget) => (target.kind === 'unstaged' ? left : []),
      conflict: async () => file,
      sync: async () => ({
        branch: 'main',
        upstream: null,
        ahead: 0,
        behind: 0,
        staged: 0,
        operation: 'merge',
        incoming: 'feature',
      }),
      git: async (action, body) => {
        calls.push([action, body])
        if (action === 'resolve-text') left = []
        return {}
      },
    })
    render(<App api={api} />)
    expect(await screen.findByText('Merging feature into main')).toBeTruthy()
    const editor = await screen.findByRole('region', { name: 'Merge a.txt' })
    fireEvent.click(within(editor).getByRole('button', { name: 'All theirs' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Mark resolved' }))
    expect(await screen.findByText('Every conflict is resolved.')).toBeTruthy()
    const proceed = await screen.findByRole('button', { name: 'Continue' })
    await waitFor(() => expect((proceed as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(proceed)
    await waitFor(() => expect(calls).toContainEqual(['continue', undefined]))
  })
})
