import type { ChangedFile, Commit, ConflictFile, DiffTarget } from '@duck-diff/protocol'
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
  sides: {
    ours: { name: 'main', sha: 'aaaaaaa', subject: 'Warmer greeting' },
    theirs: { name: 'feature', sha: 'bbbbbbb', subject: 'Loud greeting' },
    base: { name: 'merge base', sha: 'ccccccc', subject: 'Start' },
  },
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

const conflictedOnly = async (target: DiffTarget) => (target.kind === 'unstaged' ? [conflicted] : [])

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
      within(screen.getByRole('region', { name: 'Current change, conflict 1' })).getByRole('button', {
        name: /Accept current/,
      }),
    )
    const second = screen.getByRole('region', { name: 'Result, conflict 2' })
    fireEvent.click(within(second).getByRole('button', { name: 'Both, incoming first' }))
    expect(within(editor).getByText('All resolved')).toBeTruthy()
    expect(within(second).getByText('yours 2')).toBeTruthy()

    fireEvent.click(resolve)
    await waitFor(() =>
      expect(calls).toContainEqual(['resolve-text', { path: 'a.txt', text: 'top\nmine 1\nmid\nyours 2\nmine 2\n' }]),
    )
  })

  it('takes a hand edit for a block', async () => {
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    render(<App api={fakeApi({ files: conflictedOnly, conflict: async () => file })} />)
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
    render(<App api={fakeApi({ files: conflictedOnly, conflict: async () => file })} />)
    const ours = await screen.findByRole('region', { name: 'Current change, conflict 1' })
    const accept = within(ours).getByRole('button', { name: /Accept current/ })
    fireEvent.click(accept)
    expect(accept.getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('region', { name: 'Result, conflict 1' })).getByText('Current')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Result, conflict 2' })).getByText('Needs a pick')).toBeTruthy()
    const theirs = screen.getByRole('region', { name: 'Incoming change, conflict 1' })
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
    fireEvent.click(within(editor).getByRole('button', { name: 'All incoming' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Mark resolved' }))
    expect(await screen.findByText('Every conflict is resolved.')).toBeTruthy()
    const proceed = await screen.findByRole('button', { name: 'Continue' })
    await waitFor(() => expect((proceed as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(proceed)
    await waitFor(() => expect(calls).toContainEqual(['continue', undefined]))
  })
  it('stacks current over incoming over the result when the diff is stacked, each side with its commit', async () => {
    window.localStorage.setItem('duck-diff:settings', JSON.stringify({ diffStyle: 'unified' }))
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    render(<App api={fakeApi({ files: conflictedOnly, conflict: async () => file })} />)
    const block = await screen.findByRole('region', { name: 'Conflict 1' })
    const current = within(block).getByRole('region', { name: 'Current change, conflict 1' })
    expect(current.textContent).toContain('main')
    expect(current.textContent).toContain('aaaaaaa')
    expect(current.textContent).toContain('Warmer greeting')
    expect(within(block).getByRole('region', { name: 'Incoming change, conflict 1' }).textContent).toContain('bbbbbbb')
    fireEvent.click(within(current).getByRole('button', { name: /Accept current/ }))
    expect(within(within(block).getByRole('region', { name: 'Result, conflict 1' })).getByText('mine 1')).toBeTruthy()
    // The layout is the diff's setting, with no button of its own here; t flips it back to three columns.
    expect(screen.queryByRole('button', { name: /layout/ })).toBeNull()
    fireEvent.keyDown(window, { key: 't' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Conflict 1' })).toBeNull())
    window.localStorage.removeItem('duck-diff:settings')
  })

  it('shows what git is doing on every page and gives the bottom panel a Merge tab for it', async () => {
    const calls: unknown[][] = []
    const api = fakeApi({
      files: async (target: DiffTarget) => (target.kind === 'unstaged' ? [conflicted] : []),
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
        return {}
      },
    })
    render(<App api={api} />)
    const status = await screen.findByRole('button', { name: /Merging feature into main, 1 file to resolve/ })
    expect(status).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Merge conflicts, 1 to resolve' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /^Output/ }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Merge' }))
    const tab = await screen.findByRole('region', { name: 'Merge in progress' })
    fireEvent.click(within(tab).getByRole('button', { name: 'Take incoming for a.txt' }))
    await waitFor(() => expect(calls).toContainEqual(['resolve', { path: 'a.txt', side: 'theirs' }]))
  })
  it('shows every conflicted file on one page, as the diff shows changed files', async () => {
    const second: ChangedFile = { ...conflicted, path: 'b.txt' }
    let listed = [conflicted, second]
    const calls: unknown[][] = []
    const api = fakeApi({
      files: async (target: DiffTarget) => (target.kind === 'unstaged' ? listed : []),
      conflict: async (path) => ({ ...file, path }),
      git: async (action, body) => {
        calls.push([action, body])
        if (action === 'resolve-text') listed = listed.filter((entry) => entry.path !== (body as { path: string }).path)
        return {}
      },
    })
    window.history.replaceState(null, '', '/?view=merge')
    render(<App api={api} />)
    const first = await screen.findByRole('region', { name: 'Merge a.txt' })
    expect(await screen.findByRole('region', { name: 'Merge b.txt' })).toBeTruthy()
    expect(screen.getByText('2 files, 4 conflicts')).toBeTruthy()
    fireEvent.click(within(first).getByRole('button', { name: 'All current' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Mark resolved' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Merge a.txt' })).toBeNull())
    expect(screen.getByRole('region', { name: 'Merge b.txt' })).toBeTruthy()
  })

  it("blames each side and the picks, and lists each side's commits to the file", async () => {
    const who = (sha: string, author: string, text: string) => ({ sha, author, time: 0, summary: 'why', text })
    const commit = (sha: string, subject: string, authorName: string): Commit => ({
      sha,
      parents: [],
      authorName,
      authorEmail: '',
      authoredAt: 0,
      subject,
    })
    const asked: { head: string; base?: string; path?: string }[] = []
    const api = fakeApi({
      files: conflictedOnly,
      conflict: async () => file,
      conflictBlame: async () => ({
        ours: [who('1111111', 'Ada', 'top'), who('2222222', 'Ada', 'mine 1'), who('1111111', 'Ada', 'mid')],
        theirs: [who('1111111', 'Ada', 'top'), who('4444444', 'Bob', 'yours 1'), who('1111111', 'Ada', 'mid')],
        base: null,
      }),
      commits: async (query) => {
        asked.push(query)
        return query.head === 'aaaaaaa'
          ? [commit('2222222', 'Mine, not yours', 'Ada')]
          : [commit('4444444', 'Yours, not mine', 'Bob')]
      },
    })
    window.history.replaceState(null, '', '/?view=merge&path=a.txt')
    render(<App api={api} />)
    const editor = await screen.findByRole('region', { name: 'Merge a.txt' })
    expect(screen.queryByText('Bob')).toBeNull()
    const blame = within(editor).getByRole('button', { name: 'Blame' })
    fireEvent.click(blame)
    expect(blame.getAttribute('aria-pressed')).toBe('true')
    const incoming = screen.getByRole('region', { name: 'Incoming change, conflict 1' })
    expect(await within(incoming).findByText('Bob')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Current change, conflict 1' })).getByText('Ada')).toBeTruthy()

    fireEvent.click(within(incoming).getByRole('button', { name: /Accept incoming/ }))
    expect(within(screen.getByRole('region', { name: 'Result, conflict 1' })).getByText('Bob')).toBeTruthy()

    fireEvent.click(within(editor).getByRole('button', { name: 'History' }))
    const history = await screen.findByRole('region', { name: 'History of a.txt' })
    expect(await within(history).findByText('Mine, not yours')).toBeTruthy()
    expect(await within(history).findByText('Yours, not mine')).toBeTruthy()
    expect(asked).toContainEqual({ head: 'bbbbbbb', base: 'ccccccc', path: 'a.txt', limit: 100 })

    // b turns it off again for the file at the top of the page.
    fireEvent.keyDown(window, { key: 'b' })
    expect(within(screen.getByRole('region', { name: 'Incoming change, conflict 1' })).queryByText('Bob')).toBeNull()
    expect(blame.getAttribute('aria-pressed')).toBe('false')
  })
})
