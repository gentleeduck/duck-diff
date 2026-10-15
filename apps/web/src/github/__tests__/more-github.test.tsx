import type { Discussion } from '@duck-diff/protocol'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import type { GitHubApi } from '../../lib/api'
import { fakeApi } from '../../test/fake-api'

const author = { login: 'ann', avatarUrl: '' }
const summary = {
  number: 3,
  title: 'How to configure?',
  author,
  category: 'Q&A',
  emoji: ':pray:',
  answered: false,
  comments: 1,
  updatedAt: '2026-10-02T00:00:00Z',
  url: 'u',
}
const discussion: Discussion = {
  ...summary,
  id: 'D_3',
  body: 'The question',
  createdAt: '2026-10-01T00:00:00Z',
  answerable: true,
  thread: [
    {
      id: 'C_1',
      author,
      body: 'Try this',
      createdAt: '2026-10-01T00:00:00Z',
      answer: false,
      replies: [{ id: 'C_2', author, body: 'Thanks', createdAt: '2026-10-01T00:00:00Z' }],
    },
  ],
}

function github(overrides: Partial<GitHubApi>): GitHubApi {
  return { ...fakeApi().github, status: async () => ({ repo: 'o/r', user: author, source: 'gh' }), ...overrides }
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe('discussions, security and insights', () => {
  it('opens a discussion, marks the answer and replies in its thread', async () => {
    window.history.replaceState(null, '', '/?view=discussions')
    const markAnswer = vi.fn(async () => {})
    const replyDiscussion = vi.fn(async () => {})
    render(
      <App
        api={fakeApi({
          github: github({
            discussions: async () => [summary],
            discussion: async () => discussion,
            markAnswer,
            replyDiscussion,
          }),
        })}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /How to configure/ }))
    const comment = await screen.findByRole('listitem', { name: 'Comment by ann' })
    expect(within(comment).getByText('Thanks')).toBeTruthy()
    fireEvent.click(within(comment).getByRole('button', { name: /Mark as answer/ }))
    await waitFor(() => expect(markAnswer).toHaveBeenCalledWith('C_1', true))
    fireEvent.click(within(comment).getByRole('button', { name: 'Reply to ann' }))
    fireEvent.change(within(comment).getByRole('textbox', { name: 'Reply to ann' }), { target: { value: 'me too' } })
    fireEvent.click(within(comment).getByRole('button', { name: 'Reply' }))
    await waitFor(() => expect(replyDiscussion).toHaveBeenCalledWith(3, 'me too', 'C_1'))
  })

  it('lists security alerts and says which kind could not be read', async () => {
    window.history.replaceState(null, '', '/?view=security')
    render(
      <App
        api={fakeApi({
          github: github({
            security: async () => ({
              alerts: [
                {
                  kind: 'dependabot',
                  number: 4,
                  severity: 'high',
                  summary: 'Prototype pollution',
                  subject: 'lodash',
                  path: 'package.json',
                  createdAt: '2026-10-01T00:00:00Z',
                  url: 'u',
                },
              ],
              unavailable: [{ kind: 'code-scanning', reason: 'not enabled' }],
            }),
          }),
        })}
      />,
    )
    const list = await screen.findByRole('list', { name: 'Security alerts' })
    expect(within(list).getByText('Prototype pollution')).toBeTruthy()
    expect(screen.getByText(/Code scanning alerts could not be read: not enabled/)).toBeTruthy()
  })

  it('shows contributors and weekly commits from local history', async () => {
    window.history.replaceState(null, '', '/?view=insights')
    const insights = vi.fn(async () => ({
      total: 5,
      contributors: [
        { name: 'ann', email: 'a@x', commits: 4 },
        { name: 'bob', email: 'b@x', commits: 1 },
      ],
      weeks: [
        { start: 1_789_000_000, commits: 0 },
        { start: 1_789_604_800, commits: 5 },
      ],
    }))
    render(<App api={fakeApi({ insights })} />)
    expect(await screen.findByText('5 commits by 2 people on this branch')).toBeTruthy()
    // The charts draw in a real browser (e2e); jsdom has no layout, so here only their regions are checked.
    expect(screen.getByRole('region', { name: 'Contributors' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Commits per week' })).toBeTruthy()
    expect(insights).toHaveBeenCalledWith(90)
  })
})
