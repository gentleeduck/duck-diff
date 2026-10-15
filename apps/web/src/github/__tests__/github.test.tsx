import type { PullDetails } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
          closedAt: null,
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

  it('lists pull requests, opens one with its conversation, and approves it from Review changes', async () => {
    const review = vi.fn(async () => {})
    render(<App api={fakeApi({ github: githubApi({ review }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    expect(await screen.findByText('Why this exists')).toBeTruthy()
    expect(screen.getByText('Looks good')).toBeTruthy()
    // As on GitHub, the verdict is given from Review changes, not from the comment box.
    fireEvent.click(await screen.findByRole('button', { name: /Review changes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(review).toHaveBeenCalledWith(7, 'APPROVE', '', []))
  })

  it('merges only after the confirm', async () => {
    const merge = vi.fn(async () => {})
    render(<App api={fakeApi({ github: githubApi({ merge }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Squash and merge' }))
    expect(merge).not.toHaveBeenCalled()
    expect(((await screen.findByLabelText('Commit title')) as HTMLInputElement).value).toBe('Add things (#7)')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm squash and merge' }))
    await waitFor(() =>
      expect(merge).toHaveBeenCalledWith(7, 'squash', { title: 'Add things (#7)', message: '', sha: 'h' }),
    )
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
        reviewers: [],
        labels: [],
        assignees: [],
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
    expect(screen.getByText('· Approved')).toBeTruthy()
  })

  it('filters by author and label from the header menus, writing them into the search', async () => {
    const list = vi.fn(githubApi().list)
    const options = async () => ({
      labels: [{ name: 'area: web', color: 'ff0000', description: '' }],
      milestones: [],
      people: [author],
      teams: [],
    })
    render(<App api={fakeApi({ github: githubApi({ list, options }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Filter by author' }))
    const authors = await screen.findByRole('listbox', { name: 'Filter by author' })
    fireEvent.click(await within(authors).findByRole('option', { name: /octo/ }))
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ state: 'open', query: 'author:octo' })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter by label' }))
    const labels = await screen.findByRole('listbox', { name: 'Filter by label' })
    fireEvent.click(await within(labels).findByRole('option', { name: /area: web/ }))
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'open', query: 'author:octo label:"area: web"' }),
      ),
    )
    expect((screen.getByLabelText('Search pull requests') as HTMLInputElement).value).toBe(
      'author:octo label:"area: web"',
    )
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
      teams: [],
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

  it('opens an issue from a form template, writing the answers as GitHub does', async () => {
    const createIssue = vi.fn(async () => ({ number: 4 }) as never)
    const templates = async () => ({
      pull: null,
      issue: [
        {
          file: 'bug.yml',
          name: 'Bug report',
          about: 'Something broke',
          title: '[bug] ',
          labels: ['bug'],
          assignees: [],
          body: null,
          form: [
            {
              type: 'input' as const,
              id: 'what',
              label: 'What happened',
              description: '',
              placeholder: '',
              value: '',
              options: [],
              required: true,
            },
          ],
        },
      ],
    })
    window.history.replaceState(null, '', '/?view=issues')
    render(<App api={fakeApi({ github: githubApi({ createIssue, templates }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New issue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '[bug] it broke' } })
    fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'The page went blank' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open issue' }))
    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith({
        title: '[bug] it broke',
        body: '### What happened\n\nThe page went blank',
        labels: ['bug'],
        assignees: [],
      }),
    )
  })

  it('shows linked work in the sidebar and subscribes to the thread', async () => {
    const setSubscribed = vi.fn(async () => {})
    const extras = async () => ({
      subscription: 'UNSUBSCRIBED' as const,
      pinned: null,
      projects: [{ title: 'Roadmap', status: 'In progress', url: 'p' }],
      linked: [{ number: 3, title: 'Graph lanes overlap', pull: false, state: 'open' as const }],
    })
    render(<App api={fakeApi({ github: githubApi({ extras, setSubscribed }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    expect(await screen.findByRole('button', { name: /Graph lanes overlap/ })).toBeTruthy()
    expect(screen.getByText('In progress')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    await waitFor(() => expect(setSubscribed).toHaveBeenCalledWith(7, true))
  })

  it('blocks merging until an admin ticks the bypass', async () => {
    const base = fakeApi().github
    const mergeInfo = async () => ({
      ...(await base.mergeInfo(7)),
      mergeState: 'BLOCKED',
      reviewDecision: 'REVIEW_REQUIRED' as const,
      requiredApprovals: 2,
      canMergeAsAdmin: true,
    })
    render(<App api={fakeApi({ github: githubApi({ mergeInfo }) })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    expect(await screen.findByText('Review required')).toBeTruthy()
    const button = (await screen.findByRole('button', { name: 'Squash and merge' })) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/bypass rules/))
    expect(((await screen.findByRole('button', { name: /bypass/ })) as HTMLButtonElement).disabled).toBe(false)
  })

  it('steps back to the list and forward to the pull request with the page buttons', async () => {
    render(<App api={fakeApi({ github: githubApi() })} />)
    fireEvent.click(await screen.findByRole('option', { name: /Add things/ }))
    expect(await screen.findByText('Why this exists')).toBeTruthy()
    expect(window.location.search).toContain('number=7')
    fireEvent.click(screen.getByRole('tab', { name: /Commits/ }))
    await waitFor(() => expect(window.location.search).toContain('tab=commits'))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(window.location.search).not.toContain('tab='))
    expect(await screen.findByText('Why this exists')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('option', { name: /Add things/ })).toBeTruthy()
    expect(window.location.search).not.toContain('number=')
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(await screen.findByText('Why this exists')).toBeTruthy()
  })

  it('closes an issue as not planned from the close button menu', async () => {
    window.history.replaceState(null, '', '/?view=issues&number=3')
    const setIssueState = vi.fn(async () => {})
    const issue = async () => ({
      number: 3,
      title: 'Graph lanes overlap',
      state: 'open' as const,
      author,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
      labels: [],
      comments: 0,
      url: 'u',
      locked: false,
      assignees: [],
      milestone: null,
      body: 'Lanes cross',
      conversation: [],
    })
    render(<App api={fakeApi({ github: githubApi({ issue, setIssueState }) })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Choose how to close' }))
    fireEvent.click(await screen.findByRole('button', { name: /Close as not planned/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Close as not planned$/ }))
    await waitFor(() => expect(setIssueState).toHaveBeenCalledWith(3, 'closed', 'not_planned'))
  })

  it('says so when the repo has no GitHub remote', async () => {
    render(
      <App
        api={fakeApi({ github: githubApi({ status: async () => ({ repo: null, user: author, source: 'gh' }) }) })}
      />,
    )
    expect(await screen.findByText('No GitHub remote')).toBeTruthy()
  })

  it('shows unread notifications with a rail badge, marks one read, and jumps to its pull request', async () => {
    window.history.replaceState(null, '', '/?view=inbox')
    const markRead = vi.fn(async () => {})
    const notifications = vi.fn(async (all: boolean) => [
      {
        id: 'n1',
        title: 'Add things',
        type: 'PullRequest',
        reason: 'review_requested',
        unread: true,
        updatedAt: '2026-10-02T00:00:00Z',
        number: 7,
      },
      ...(all
        ? [
            {
              id: 'n2',
              title: 'Old news',
              type: 'Issue',
              reason: 'mention',
              unread: false,
              updatedAt: '2026-09-02T00:00:00Z',
              number: 3,
            },
          ]
        : []),
    ])
    render(<App api={fakeApi({ github: githubApi({ notifications, markRead }) })} />)
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy()
    expect(await screen.findByText('Review requested')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(await screen.findByText('Old news')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(null))
    fireEvent.click(screen.getByRole('button', { name: /Add things/ }))
    expect(await screen.findByText('Why this exists')).toBeTruthy()
    expect(window.location.search).toContain('view=prs')
  })

  it('lists releases and publishes a new one with generated notes', async () => {
    window.history.replaceState(null, '', '/?view=releases')
    const release = {
      id: 1,
      name: 'First',
      tag: 'v1.0.0',
      body: 'Hello',
      html: '<p>Hello <em>world</em></p>',
      draft: false,
      prerelease: true,
      publishedAt: '2026-10-01T00:00:00Z',
      author,
      url: 'https://github.com/o/r/releases/tag/v1.0.0',
    }
    const createRelease = vi.fn(async () => ({ ...release, id: 2, tag: 'v1.1.0' }))
    render(<App api={fakeApi({ github: githubApi({ releases: async () => [release], createRelease }) })} />)
    expect(await screen.findByRole('article', { name: 'First' })).toBeTruthy()
    expect(screen.getByText('Pre-release')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New release' }))
    fireEvent.change(await screen.findByLabelText('Tag'), { target: { value: 'v1.1.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish release' }))
    await waitFor(() =>
      expect(createRelease).toHaveBeenCalledWith({
        tag: 'v1.1.0',
        target: '',
        name: '',
        body: '',
        draft: false,
        prerelease: false,
        generateNotes: true,
      }),
    )
  })

  it('lists workflow runs, re-runs a finished one and cancels a running one', async () => {
    window.history.replaceState(null, '', '/?view=actions')
    const run = {
      id: 5,
      name: 'CI',
      title: 'Add things',
      status: 'completed',
      conclusion: 'failure',
      branch: 'feat',
      event: 'push',
      createdAt: '2026-10-02T00:00:00Z',
      actor: author,
      url: 'u',
    }
    const runAction = vi.fn(async () => {})
    render(
      <App
        api={fakeApi({
          github: githubApi({
            runs: async () => [run, { ...run, id: 6, name: 'Deploy', status: 'in_progress', conclusion: null }],
            runAction,
          }),
        })}
      />,
    )
    expect(await screen.findByRole('img', { name: 'Failed' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'In progress' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Re-run CI' }))
    await waitFor(() => expect(runAction).toHaveBeenCalledWith(5, 'rerun'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Deploy' }))
    await waitFor(() => expect(runAction).toHaveBeenCalledWith(6, 'cancel'))
  })
})
