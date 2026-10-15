import type { Ref } from '@duck-diff/protocol'
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

// The graph the server put into the page when it opens on the graph (server state.ts pageGraph).
interface Seed {
  key: string
  text: string
  refs: Ref[]
}

function readSeed(): Seed | null {
  const script = typeof document === 'undefined' ? null : document.getElementById('duck-diff-graph')
  if (!script?.textContent) return null
  try {
    return JSON.parse(script.textContent) as Seed
  } catch {
    return null
  }
}

// Lays out a whole log at once.
function layoutAll(text: string, refs: readonly Ref[]): { entries: GraphEntry[]; rows: GraphRow[] } {
  const remotes = new Set(refs.filter((ref) => ref.kind === 'remote').map((ref) => ref.name))
  const layout = createLayout()
  const entries: GraphEntry[] = []
  const rows: GraphRow[] = []
  const reader = createRecordReader((entry) => {
    entries.push(entry)
    rows.push(...layout.push([entry]))
  }, remotes)
  reader.push(text)
  reader.finish()
  return { entries, rows }
}

// Streams the log, lays out lanes as records arrive, and publishes in 50 ms batches so long histories show quickly.
export function createGraph(api: Api, seed: Seed | null = typeof window === 'undefined' ? null : readSeed()): Graph {
  // A graph that came with the page is drawn in its first frame; reading it again waits for the page to idle.
  const first = seed?.key === `false:${LIMIT}` ? layoutAll(seed.text, seed.refs) : null
  const store = createStore<GraphState>({
    entries: first?.entries ?? [],
    rows: first?.rows ?? [],
    status: first ? 'ready' : 'idle',
    all: false,
    error: null,
  })
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
      // A reload keeps the list on screen until the new one is as long; swapping in the first few records
      // would shrink the page and throw the scroll position away.
      const shown = store.get().entries.length
      const flush = () => {
        timer = null
        if (controller.signal.aborted || entries.length < shown) return
        store.set((prev) => ({ ...prev, entries: [...entries], rows: [...rows] }))
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
