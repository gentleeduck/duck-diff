import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import { createLayout, type GraphRow } from './layout'
import { createRecordReader, type GraphEntry } from './records'

export interface GraphState {
  entries: GraphEntry[]
  rows: GraphRow[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  all: boolean
  error: string | null
}

export interface Graph extends Store<GraphState> {
  load(): Promise<void>
  setAll(all: boolean): void
}

const LIMIT = 20_000

// Streams the log, lays out lanes as records arrive, and publishes in 50 ms batches so long histories show quickly.
export function createGraph(api: Api): Graph {
  const store = createStore<GraphState>({ entries: [], rows: [], status: 'idle', all: false, error: null })
  let current: AbortController | null = null

  async function load() {
    current?.abort()
    const controller = new AbortController()
    current = controller
    store.set((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      // Both at once: the log does not need the refs to start streaming, only to name remote branches.
      const [refs, body] = await Promise.all([
        api.refs(),
        api.graph({ all: store.get().all, limit: LIMIT }, controller.signal),
      ])
      const remotes = new Set(refs.filter((ref) => ref.kind === 'remote').map((ref) => ref.name))
      const layout = createLayout()
      const entries: GraphEntry[] = []
      const rows: GraphRow[] = []
      let timer: ReturnType<typeof setTimeout> | null = null
      const flush = () => {
        timer = null
        if (!controller.signal.aborted) store.set((prev) => ({ ...prev, entries: [...entries], rows: [...rows] }))
      }
      const reader = createRecordReader((entry) => {
        entries.push(entry)
        rows.push(...layout.push([entry]))
        if (entries.length === 1) flush()
        else timer ??= setTimeout(flush, 50)
      }, remotes)
      const stream = body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await stream.read()
        if (done || controller.signal.aborted) break
        reader.push(decoder.decode(value, { stream: true }))
      }
      reader.finish()
      if (timer) clearTimeout(timer)
      if (controller.signal.aborted) return
      store.set((prev) => ({ ...prev, entries, rows, status: 'ready' }))
    } catch (error) {
      if (controller.signal.aborted) return
      store.set((prev) => ({ ...prev, status: 'error', error: (error as Error).message }))
    }
  }

  return {
    ...store,
    load,
    setAll(all) {
      store.set((prev) => ({ ...prev, all }))
      void load()
    },
  }
}
