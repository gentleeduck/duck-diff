import type { Commit, Ref } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import type { Session } from './session'

export interface RefList {
  refs: Ref[]
  commits: Commit[]
  // False until the first read answers; a repo with no commits yet has no refs at all.
  loaded: boolean
}

export interface Refs extends Store<RefList> {
  // Starts the first read; later calls share it.
  load(): void
  reload(): Promise<void>
}

// One list for every picker and menu. The first read waits for the diff's own first load, so these
// git commands never compete with the request that paints the first row.
// Reads go through the query cache when the page passes it, so the pickers and the history share one read.
export interface RefReads {
  refs(): Promise<Ref[]>
  commits(): Promise<Commit[]>
  // What the page already holds (its saved answers), shown until the first read.
  cached?(): Ref[] | undefined
}

export function createRefs(
  api: Api,
  session: Session,
  reads: RefReads = { refs: () => api.refs(), commits: () => api.commits({ head: 'HEAD', limit: 50 }) },
): Refs {
  const store = createStore<RefList>({ refs: reads.cached?.() ?? [], commits: [], loaded: false })
  let started = false

  const read = async () => {
    const [refs, commits] = await Promise.all([reads.refs(), reads.commits().catch(() => [])])
    store.set({ refs, commits, loaded: true })
  }

  const afterFirstDiff = () =>
    new Promise<void>((resolve) => {
      const settled = () => session.get().status === 'ready' || session.get().status === 'error'
      if (settled()) return resolve()
      const stop = session.subscribe(() => {
        if (!settled()) return
        stop()
        resolve()
      })
    })

  return {
    ...store,
    load() {
      if (started) return
      started = true
      void afterFirstDiff()
        .then(read)
        .catch(() => {})
    },
    async reload() {
      if (started) await read().catch(() => {})
    },
  }
}
