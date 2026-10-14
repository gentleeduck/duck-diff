import type { ChangedFile, DiffTarget } from '@duck-diff/protocol'
import type { CodeViewDiffItem } from '@pierre/diffs'
import type { Api } from '../lib/api'
import { cacheKeyFor, toDiffItem } from '../lib/items'
import { readPatchStream } from '../lib/patch-stream'
import { createStore, type Store } from '../lib/store'

// Binary files and huge diffs start folded so opening a large comparison stays fast.
const COLLAPSE_LINES = 5000
function shouldCollapse(file: ChangedFile): boolean {
  return file.binary || (file.additions ?? 0) + (file.deletions ?? 0) > COLLAPSE_LINES
}

export interface SessionState {
  target: DiffTarget
  status: 'idle' | 'loading' | 'ready' | 'error'
  files: ChangedFile[]
  items: CodeViewDiffItem<undefined>[]
  error: string | null
  loadedAt: number
  streaming: boolean
}

export interface Session extends Store<SessionState> {
  load(target: DiffTarget): Promise<void>
  reload(): Promise<void>
}

export function createSession(api: Api, initial: DiffTarget): Session {
  const store = createStore<SessionState>({
    target: initial,
    status: 'idle',
    files: [],
    items: [],
    error: null,
    loadedAt: 0,
    streaming: false,
  })
  let current: AbortController | null = null

  async function load(target: DiffTarget) {
    current?.abort()
    const controller = new AbortController()
    current = controller
    store.set((prev) => ({ ...prev, target, status: 'loading', error: null }))
    try {
      const files = await api.files(target, controller.signal)
      if (controller.signal.aborted) return
      const byPath = new Map(files.map((file) => [file.path, file]))
      const items: CodeViewDiffItem<undefined>[] = []
      let flushTimer: ReturnType<typeof setTimeout> | null = null
      // Publishing in 50 ms batches lets files appear while git is still streaming without a render per file.
      const flush = () => {
        flushTimer = null
        if (controller.signal.aborted) return
        store.set((prev) => ({ ...prev, files, items: [...items], streaming: true }))
      }
      const body = await api.diff(target, controller.signal)
      await readPatchStream(
        body,
        (text) => {
          const item = toDiffItem(text)
          if (!item) return
          const file = byPath.get(item.fileDiff.name)
          if (file) {
            item.fileDiff.cacheKey = cacheKeyFor(file)
            item.collapsed = shouldCollapse(file)
          }
          items.push(item)
          flushTimer ??= setTimeout(flush, 50)
        },
        controller.signal,
      )
      if (flushTimer) clearTimeout(flushTimer)
      if (controller.signal.aborted) return
      store.set((prev) => ({ ...prev, files, items, status: 'ready', loadedAt: Date.now(), streaming: false }))
    } catch (error) {
      if (controller.signal.aborted) return
      store.set((prev) => ({ ...prev, status: 'error', error: (error as Error).message, streaming: false }))
    }
  }

  return { ...store, load, reload: () => load(store.get().target) }
}
