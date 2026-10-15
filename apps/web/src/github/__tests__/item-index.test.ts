import { describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { readIndex } from '../item-index'

const item = (number: number, title: string) => ({
  number,
  title,
  state: 'open' as const,
  merged: false,
  draft: false,
  author: { login: 'octo', avatarUrl: '' },
  labels: [],
  comments: 0,
  assignees: [],
  milestone: null,
  updatedAt: 'x',
  createdAt: 'x',
  closedAt: null,
  url: 'u',
  review: null,
  checks: null,
})

describe('item index', () => {
  it('reads every open item and the recent closed ones, pull requests first', async () => {
    const list = vi.fn(async (query: { kind: 'pr' | 'issue'; state?: 'open' | 'closed' }) => ({
      items: query.state === 'open' ? [item(query.kind === 'pr' ? 7 : 3, `${query.kind} open`)] : [item(1, 'closed')],
      total: 1,
      cursor: null,
    }))
    const api = fakeApi()
    const items = await readIndex({ ...api, github: { ...api.github, list } })
    expect(items.map((entry) => `${entry.kind}#${entry.number}`)).toEqual(['pr#7', 'pr#1', 'issue#3', 'issue#1'])
    expect(items[0]?.author).toBe('octo')
  })

  it('follows the cursor for open items, up to three pages', async () => {
    const list = vi.fn(async (query: { state?: 'open' | 'closed'; after?: string }) => ({
      items: [],
      total: 0,
      cursor: query.state === 'open' ? `next${query.after ?? ''}` : null,
    }))
    const api = fakeApi()
    await readIndex({ ...api, github: { ...api.github, list } })
    // Three open pages and one closed page, for each kind.
    expect(list).toHaveBeenCalledTimes(8)
  })
})
