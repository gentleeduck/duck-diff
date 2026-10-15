import type { ListItem } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'

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

export interface ItemIndexState {
  repo: string | null
  items: IndexedItem[]
  // When the list was last read from GitHub, in ms; 0 when it only came from storage.
  readAt: number
}

export interface ItemIndex extends Store<ItemIndexState> {
  // Shows the saved list for this repo at once, then reads GitHub for a fresh one.
  open(repo: string): void
  // Reads GitHub again, unless a read finished less than maxAge ago.
  refresh(maxAge?: number): Promise<void>
}

const KEY = (repo: string) => `duck-diff:items:${repo}`
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

// Every pull request and issue the palette can jump to, kept in localStorage per repo so a restart
// shows them before GitHub answers.
export function createItemIndex(api: Api): ItemIndex {
  const store = createStore<ItemIndexState>({ repo: null, items: [], readAt: 0 })
  let reading: Promise<void> | null = null

  const save = (repo: string, items: IndexedItem[]) => {
    try {
      window.localStorage.setItem(KEY(repo), JSON.stringify(items))
    } catch {}
  }

  async function readAll(kind: 'pr' | 'issue'): Promise<IndexedItem[]> {
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

  async function refresh(maxAge = 0) {
    const { repo, readAt } = store.get()
    if (!repo || (maxAge && Date.now() - readAt < maxAge)) return
    reading ??= Promise.all([readAll('pr'), readAll('issue')])
      .then(([pulls, issues]) => {
        if (store.get().repo !== repo) return
        const items = [...pulls, ...issues]
        store.set({ repo, items, readAt: Date.now() })
        save(repo, items)
      })
      .catch(() => {})
      .finally(() => {
        reading = null
      })
    return reading
  }

  return {
    ...store,
    open(repo) {
      if (store.get().repo === repo) return
      let saved: IndexedItem[] = []
      try {
        saved = JSON.parse(window.localStorage.getItem(KEY(repo)) ?? '[]') as IndexedItem[]
      } catch {}
      store.set({ repo, items: saved, readAt: 0 })
      void refresh()
    },
    refresh,
  }
}
