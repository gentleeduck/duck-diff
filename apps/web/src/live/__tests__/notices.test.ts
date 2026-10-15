import type { Notification, WorkflowRun } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { newNotices } from '../notices'

const note = (id: string, reason: string, unread = true): Notification => ({
  id,
  title: `thing ${id}`,
  type: 'PullRequest',
  reason,
  unread,
  updatedAt: 't1',
  number: Number(id),
})
const run = (id: number, conclusion: string | null, login: string): WorkflowRun => ({
  id,
  name: 'ci',
  title: 'fix',
  status: 'completed',
  conclusion,
  branch: 'feat',
  event: 'pull_request',
  createdAt: 't',
  actor: { login, avatarUrl: '' },
  url: '',
})

describe('desktop notices', () => {
  it('remembers what is there at first, then reports only what is new', () => {
    const first = newNotices(null, [note('1', 'review_requested')], [run(1, 'failure', 'me')], 'me')
    expect(first.notices).toEqual([])
    const second = newNotices(
      first.seen,
      [
        note('1', 'review_requested'),
        note('2', 'review_requested'),
        note('3', 'mention'),
        note('4', 'review_requested', false),
      ],
      [run(1, 'failure', 'me'), run(2, 'failure', 'me'), run(3, 'failure', 'someone'), run(4, 'success', 'me')],
      'me',
    )
    expect(second.notices).toEqual([
      { key: 'review:2:t1', title: 'Review requested', body: '#2 thing 2' },
      { key: 'run:2', title: 'ci failed', body: 'fix on feat' },
    ])
    expect(newNotices(second.seen, [note('2', 'review_requested')], [run(2, 'failure', 'me')], 'me').notices).toEqual(
      [],
    )
  })
})
