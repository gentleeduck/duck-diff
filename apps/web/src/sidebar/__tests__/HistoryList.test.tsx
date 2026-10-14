import type { Commit } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider } from '../../app/AppProvider'
import { fakeApi } from '../../test/fake-api'
import { HistoryList } from '../HistoryList'
import { relativeTime } from '../relative-time'

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0) / 1000

function commit(sha: string, subject: string, minutesAgo: number): Commit {
  return { sha, parents: [], authorName: 'Duck', authorEmail: 'd@x', authoredAt: NOW - minutesAgo * 60, subject }
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe('relativeTime', () => {
  it('reads like a person would say it', () => {
    expect(relativeTime(NOW - 30, NOW)).toBe('just now')
    expect(relativeTime(NOW - 5 * 60, NOW)).toBe('5 min ago')
    expect(relativeTime(NOW - 3 * 3600, NOW)).toBe('3 h ago')
    expect(relativeTime(NOW - 2 * 86400, NOW)).toBe('2 days ago')
  })
})

describe('HistoryList', () => {
  it('lists the branch commits against main and opens one on click', async () => {
    const commits = vi.fn(async () => [
      commit('a'.repeat(40), 'feat: second', 5),
      commit('b'.repeat(40), 'feat: first', 60),
    ])
    const api = fakeApi({
      repo: async () => ({ root: '/r', branch: 'feat', head: 'a'.repeat(40), nvim: false }),
      refs: async () => [
        { name: 'main', kind: 'branch', sha: 'c', committedAt: 0, current: false },
        { name: 'feat', kind: 'branch', sha: 'a', committedAt: 0, current: true },
      ],
      commits,
    })
    render(
      <AppProvider api={api}>
        <HistoryList now={NOW} />
      </AppProvider>,
    )
    await waitFor(() => expect(screen.getByText('feat: second')).toBeTruthy())
    expect(commits).toHaveBeenCalledWith({ head: 'HEAD', base: 'main', limit: 200 })
    expect(screen.getByText('5 min ago')).toBeTruthy()
    fireEvent.click(screen.getByText('feat: first'))
    expect(window.location.search).toContain('b'.repeat(40))
    await waitFor(() =>
      expect(screen.getByText('feat: first').closest('button')?.getAttribute('aria-current')).toBe('true'),
    )
  })

  it('shows full history on the default branch', async () => {
    const commits = vi.fn(async () => [])
    const api = fakeApi({
      refs: async () => [{ name: 'main', kind: 'branch', sha: 'c', committedAt: 0, current: true }],
      commits,
    })
    render(
      <AppProvider api={api}>
        <HistoryList now={NOW} />
      </AppProvider>,
    )
    await waitFor(() => expect(commits).toHaveBeenCalledWith({ head: 'HEAD', limit: 200 }))
    expect(await screen.findByText('No commits to show.')).toBeTruthy()
  })
})
