import type { ListItem } from '@duck-diff/protocol'
import type { Api } from '../lib/api'

export interface IndexedItem {
  kind: 'pr' | 'issue'
  number: number
  title: string
  state: 'open' | 'closed'
  merged: boolean
  draft: boolean
  author: string
  labels: { name: string; color: string }[]
  updatedAt: string
}

const OPEN_PAGES = 3

const index = (kind: 'pr' | 'issue', item: ListItem): IndexedItem => ({
  kind,
  number: item.number,
  title: item.title,
  state: item.state,
  merged: item.merged,
  draft: item.draft,
  author: item.author.login,
  labels: item.labels,
  updatedAt: item.updatedAt,
})

async function readAll(api: Api, kind: 'pr' | 'issue'): Promise<IndexedItem[]> {
  const found: IndexedItem[] = []
  let after: string | undefined
  for (let page = 0; page < OPEN_PAGES; page++) {
    const result = await api.github.list({ kind, state: 'open', filter: 'all', sort: 'updated', query: '', after })
    found.push(...result.items.map((item) => index(kind, item)))
    if (!result.cursor) break
    after = result.cursor
  }
  const closed = await api.github.list({ kind, state: 'closed', filter: 'all', sort: 'updated', query: '' })
  return [...found, ...closed.items.map((item) => index(kind, item))]
}

// Every pull request and issue the palette can jump to: every open one and the recently closed.
export async function readIndex(api: Api): Promise<IndexedItem[]> {
  const [pulls, issues] = await Promise.all([readAll(api, 'pr'), readAll(api, 'issue')])
  return [...pulls, ...issues]
}
