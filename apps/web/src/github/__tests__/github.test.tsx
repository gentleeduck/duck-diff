import type { PullDetails } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import type { GitHubApi } from '../../lib/api'
import { fakeApi } from '../../test/fake-api'

const author = { login: 'octo', avatarUrl: '' }
const pull: PullDetails = {
  number: 7,
  title: 'Add things',
  state: 'open',
  merged: false,
  draft: false,
  author,
  headRef: 'feat',
  baseRef: 'main',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  labels: [],
  url: 'https://github.com/o/r/pull/7',
  body: 'Why this exists',
  headSha: 'h',
  baseSha: 'b',
  mergeable: true,
  additions: 3,
  deletions: 1,
  changedFiles: 2,
  comments: [{ id: 1, author, body: 'Looks good', createdAt: '2026-10-02T00:00:00Z' }],
  reviewComments: [],
}

function githubApi(overrides: Partial<GitHubApi> = {}): GitHubApi {
  const base = fakeApi().github
  return {
    ...base,
    status: async () => ({ repo: 'o/r', user: author, source: 'gh' }),
    pulls: async () => [pull],
    pull: async () => pull,
    ...overrides,
  }
}

describe('GitHub views', () => {
  beforeEach(() => window.history.replaceState(null, '', '/?view=prs'))

  it('asks to sign in when no token is found, and signs in with a pasted one', async () => {
    const signIn = vi.fn(async () => ({ repo: 'o/r', user: author, source: 'token' as const }))
    render(
      <App
        api={fakeApi({
          github: githubApi({ status: async () => ({ repo: 'o/r', user: null, source: null }), signIn }),
        })}
      />,
    )
    const field = await screen.findByLabelText('GitHub token')
    fireEvent.change(field, { target: { value: 'ghp_1234567890' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('ghp_1234567890'))
    expect(await screen.findByRole('option', { name: /Add things/ })).toBeTruthy()
  })

  it('lists pull requests, opens one with its conversation, and approves it', async () => {
    const review = vi.fn(async () => {})
    render(<App api={fakeApi({ github: githubApi({ review }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    expect(await screen.findByText('Why this exists')).toBeTruthy()
    expect(screen.getByText('Looks good')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(review).toHaveBeenCalledWith(7, 'APPROVE', ''))
  })

  it('merges only after the confirm', async () => {
    const merge = vi.fn(async () => {})
    render(<App api={fakeApi({ github: githubApi({ merge }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }))
    expect(merge).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm merge' }))
    await waitFor(() => expect(merge).toHaveBeenCalledWith(7, 'squash'))
  })

  it('opens a pull request from the current branch, titled by its latest commit', async () => {
    const createPull = vi.fn(async () => ({ ...pull, number: 9 }))
    const api = fakeApi({
      commits: async () => [{ sha: 'abc', subject: 'Latest work', author: 'octo', authoredAt: 1 }] as never,
      sync: async () => ({ branch: 'feat', upstream: 'origin/feat', ahead: 0, behind: 0, staged: 0 }),
      github: githubApi({ createPull, defaultBranch: async () => 'trunk' }),
    })
    render(<App api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New pull request' }))
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Latest work'))
    // The submit button waits for the base branch from GitHub.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open pull request' })).not.toHaveProperty('disabled', true),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open pull request' }))
    await waitFor(() =>
      expect(createPull).toHaveBeenCalledWith({
        title: 'Latest work',
        body: '',
        head: 'feat',
        base: 'trunk',
        draft: false,
      }),
    )
  })

  it('says so when the repo has no GitHub remote', async () => {
    render(
      <App
        api={fakeApi({ github: githubApi({ status: async () => ({ repo: null, user: author, source: 'gh' }) }) })}
      />,
    )
    expect(await screen.findByText('No GitHub remote')).toBeTruthy()
  })
})
