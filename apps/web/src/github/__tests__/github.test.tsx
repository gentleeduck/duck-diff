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
  commits: 3,
  assignees: [],
  milestone: null,
  reviewers: [{ login: 'duck', avatarUrl: '', state: 'APPROVED' }],
  mergeableState: 'clean',
  nodeId: 'PR_7',
  autoMerge: false,
  sameRepo: true,
  headExists: true,
  locked: false,
  comments: [{ id: 1, author, body: 'Looks good', createdAt: '2026-10-02T00:00:00Z' }],
  reviewComments: [],
}

function githubApi(overrides: Partial<GitHubApi> = {}): GitHubApi {
  const base = fakeApi().github
  return {
    ...base,
    status: async () => ({ repo: 'o/r', user: author, source: 'gh' }),
    pulls: async () => [pull],
    list: async () => ({
      items: [
        {
          ...pull,
          comments: 1,
          assignees: [],
          milestone: null,
          review: 'APPROVED' as const,
          checks: 'SUCCESS' as const,
        },
      ],
      total: 1,
      cursor: null,
    }),
    pull: async () => pull,
    thread: async () => ({
      number: 7,
      title: pull.title,
      body: pull.body,
      html: null,
      author,
      createdAt: pull.createdAt,
      edited: false,
      reactions: { '+1': 2 },
      timeline: [
        {
          kind: 'comment' as const,
          id: 1,
          author,
          body: 'Looks good',
          html: '<p>Looks <strong>good</strong></p><script>alert(1)</script>',
          createdAt: '2026-10-02T00:00:00Z',
          edited: false,
          reactions: {},
          url: 'u',
        },
        {
          kind: 'event' as const,
          id: 'e1',
          event: 'labeled',
          actor: author,
          text: 'added the bug label',
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
      viewer: { login: 'octo', canEdit: true },
    }),
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
    fireEvent.click(await screen.findByRole('button', { name: 'Squash and merge' }))
    expect(merge).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm merge' }))
    await waitFor(() => expect(merge).toHaveBeenCalledWith(7, 'squash'))
  })

  it('opens a pull request from the current branch, titled by its latest commit', async () => {
    const createPull = vi.fn(async () => ({ ...pull, number: 9 }))
    const api = fakeApi({
      commits: async () => [{ sha: 'abc', subject: 'Latest work', author: 'octo', authoredAt: 1 }] as never,
      sync: async () => ({ branch: 'feat', upstream: 'origin/feat', ahead: 0, behind: 0, staged: 0, operation: null }),
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

  it('searches with GitHub syntax and filters after typing settles', async () => {
    const list = vi.fn(githubApi().list)
    render(<App api={fakeApi({ github: githubApi({ list }) })} />)
    fireEvent.change(await screen.findByLabelText('Search pull requests'), { target: { value: 'label:bug' } })
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'pr', query: 'label:bug' })),
    )
    expect(screen.getByLabelText('Approved')).toBeTruthy()
  })

  it('shows the timeline, quotes a comment into the box, and reacts', async () => {
    const react = vi.fn(async () => {})
    render(<App api={fakeApi({ github: githubApi({ react }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    expect(await screen.findByText(/added the bug label/)).toBeTruthy()
    // GitHub's rendering shows, and anything that could run is stripped.
    expect((await screen.findByText('good')).tagName).toBe('STRONG')
    expect(document.querySelector('.gh-markdown script')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /Actions for octo's comment/ })[1] as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Quote reply' }))
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: 'Comment on this pull request' }) as HTMLTextAreaElement).value).toBe(
        '> Looks good\n\n',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '+1 reaction, 2' }))
    await waitFor(() => expect(react).toHaveBeenCalledWith({ issue: 7 }, '+1'))
  })

  it('edits labels from the sidebar picker, sending the change once it closes', async () => {
    const editThread = vi.fn(async () => {})
    const options = async () => ({
      labels: [{ name: 'bug', color: 'ff0000', description: 'Something broke' }],
      milestones: [],
      people: [],
    })
    render(<App api={fakeApi({ github: githubApi({ editThread, options }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit labels' }))
    fireEvent.click(await screen.findByRole('option', { name: /bug/ }))
    expect(editThread).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(editThread).toHaveBeenCalledWith(7, { labels: ['bug'] }))
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
