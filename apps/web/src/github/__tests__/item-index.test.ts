import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { createItemIndex } from '../item-index'

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
  beforeEach(() => window.localStorage.clear())

  it('reads every open item and recent closed ones, saves them, and shows the saved list on the next start', async () => {
    const list = vi.fn(async (query: { kind: 'pr' | 'issue'; state?: 'open' | 'closed' }) => ({
      items: query.state === 'open' ? [item(query.kind === 'pr' ? 7 : 3, `${query.kind} open`)] : [],
      total: 1,
      cursor: null,
    }))
    const api = fakeApi()
    const index = createItemIndex({ ...api, github: { ...api.github, list } })
    index.open('o/r')
    await index.refresh()
    expect(index.get().items.map((entry) => `${entry.kind}#${entry.number}`)).toEqual(['pr#7', 'issue#3'])

    // A restart shows the saved list straight away, before GitHub answers.
    const never = vi.fn(() => new Promise<never>(() => {}))
    const restarted = createItemIndex({ ...api, github: { ...api.github, list: never } })
    restarted.open('o/r')
    expect(restarted.get().items.map((entry) => entry.title)).toEqual(['pr open', 'issue open'])
    expect(restarted.get().readAt).toBe(0)
  })

  it('skips a read while the last one is fresh enough', async () => {
    const list = vi.fn(async () => ({ items: [], total: 0, cursor: null }))
    const api = fakeApi()
    const index = createItemIndex({ ...api, github: { ...api.github, list } })
    index.open('o/r')
    await index.refresh()
    const calls = list.mock.calls.length
    await index.refresh(60_000)
    expect(list.mock.calls.length).toBe(calls)
  })
})
