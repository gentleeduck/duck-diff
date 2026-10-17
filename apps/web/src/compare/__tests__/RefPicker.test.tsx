import type { Commit, Ref, ResolvedCommit, ResolvedRevision } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppProvider } from '../../app/AppProvider'
import type { Api } from '../../lib/api'
import { fakeApi } from '../../test/fake-api'
import { RefPicker } from '../RefPicker'

const commit = (sha: string, subject: string): Commit => ({
  sha,
  parents: [],
  authorName: 'Duck',
  authorEmail: 'd@d',
  authoredAt: 0,
  subject,
})
const ref = (name: string): Ref => ({ name, kind: 'branch', sha: 'a'.repeat(40), committedAt: 0, current: false })
const resolved = (ref: string, sha: string, subject: string, note: string | null = null): ResolvedCommit => ({
  kind: 'commit',
  ref,
  sha,
  subject,
  note,
})

const PARENT = resolved('1eb597840^', 'd'.repeat(40), 'the parent', 'before 1eb5978')
const PARSER = commit('c'.repeat(40), 'fix the parser')

// git's answers: a caret form is the commit before, a range is both sides, anything else unknown.
const resolve: Api['resolve'] = async (rev): Promise<ResolvedRevision> => {
  if (rev === '^1eb597840') return PARENT
  if (rev === 'HEAD~2..HEAD')
    return {
      kind: 'range',
      from: resolved('HEAD~2', 'e'.repeat(40), 'older'),
      to: resolved('HEAD', 'f'.repeat(40), 'newest'),
      mode: 'two-dot',
    }
  return { kind: 'unknown', reason: `git knows no commit called ${rev} here` }
}
const commits: Api['commits'] = async (query) => (query.grep === 'parser' ? [PARSER] : [])

function open(value = '') {
  const onPick = vi.fn()
  const onRange = vi.fn()
  render(
    <AppProvider api={fakeApi({ resolve, commits })}>
      <RefPicker
        label="HEAD"
        side="from"
        value={value}
        refs={{ refs: [ref('main'), ref('feat/x')], commits: [] }}
        onPick={onPick}
        onRange={onRange}
      />
    </AppProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Compare from HEAD' }))
  return { onPick, onRange, input: screen.getByPlaceholderText(/Branch, tag/) }
}

describe('ref picker', () => {
  it('opens with its value selected, to be replaced by typing or edited in place, the list unfiltered', async () => {
    const { input } = open('1eb5978')
    const box = input as HTMLInputElement
    expect(box.value).toBe('1eb5978')
    await waitFor(() => expect([box.selectionStart, box.selectionEnd]).toEqual([0, 7]))
    // Opening is not a search: every branch still shows until the text changes.
    expect(screen.getByRole('option', { name: /main/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /feat\/x/ })).toBeTruthy()
  })

  it('takes the value edited in place with Enter', async () => {
    const { onPick, input } = open('1eb5978')
    fireEvent.change(input, { target: { value: '^1eb597840' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onPick).toHaveBeenCalledWith({ kind: 'ref', name: '1eb597840^' }))
  })

  it('takes any revision typed and says which commit git reads it as', async () => {
    open()
    fireEvent.change(screen.getByPlaceholderText(/Branch, tag/), { target: { value: '^1eb597840' } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/before 1eb5978.*ddddddd.*the parent/))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('picks what was typed with Enter, even before git has answered, as the ref git read', async () => {
    const { onPick, input } = open()
    fireEvent.change(input, { target: { value: '^1eb597840' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onPick).toHaveBeenCalledWith({ kind: 'ref', name: '1eb597840^' }))
  })

  it('sets both sides from a typed range', async () => {
    const { onRange, input } = open()
    fireEvent.change(input, { target: { value: 'HEAD~2..HEAD' } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/eeeeeee\.\.fffffff/))
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(onRange).toHaveBeenCalledWith({ kind: 'range', from: 'HEAD~2', to: 'HEAD', mode: 'two-dot' }),
    )
  })

  it('shows why git does not know what was typed as an error, not a row to pick, and Enter does nothing', async () => {
    const { onPick, input } = open()
    fireEvent.change(input, { target: { value: 'nope' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect((await screen.findByRole('alert')).textContent).toBe('git knows no commit called nope here')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('option', { name: /git knows no commit/ })).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('applies a known revision with its Use button too', async () => {
    const { onPick, input } = open()
    fireEvent.change(input, { target: { value: '^1eb597840' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Use' }))
    await waitFor(() => expect(onPick).toHaveBeenCalledWith({ kind: 'ref', name: '1eb597840^' }))
  })

  it('finds commits by their message', async () => {
    const { onPick, input } = open()
    fireEvent.change(input, { target: { value: 'parser' } })
    const matching = await screen.findByRole('group', { name: 'Commits matching parser' })
    fireEvent.click(within(matching).getByRole('option', { name: /fix the parser/ }))
    expect(onPick).toHaveBeenCalledWith({ kind: 'ref', name: PARSER.sha })
  })

  it('narrows branches and tags as you type', async () => {
    const { input } = open()
    expect(screen.getByRole('option', { name: /main/ })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'feat' } })
    await waitFor(() => expect(screen.queryByRole('option', { name: /^main/ })).toBeNull())
    expect(screen.getByRole('option', { name: /feat\/x/ })).toBeTruthy()
  })
})
