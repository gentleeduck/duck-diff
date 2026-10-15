import { type ChangedFile, type DiffTarget, targetKey } from '@duck-diff/protocol'
import type { CodeViewDiffItem } from '@pierre/diffs'
import type { SavedTokens } from '../diff/highlight'
import type { Api } from '../lib/api'
import { cacheKeyFor, toDiffItem } from '../lib/items'
import { createPatchSplitter, readPatchStream } from '../lib/patch-stream'
import { createStore, type Store } from '../lib/store'
import { isImage } from '../viewer/file-info'

// Binary, generated and huge diffs start folded so opening a large comparison stays fast.
const COLLAPSE_LINES = 5000
function shouldCollapse(file: ChangedFile): boolean {
  // Images stay open: their preview is the useful part.
  if (file.binary) return !isImage(file.path)
  return Boolean(file.generated) || (file.additions ?? 0) + (file.deletions ?? 0) > COLLAPSE_LINES
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
  // Reads a diff into memory without showing it, so switching to it later is instant.
  prefetch(target: DiffTarget): void
  reload(): Promise<void>
}

// Diffs kept in memory so switching between tabs shows them at once; the oldest goes first.
const KEPT = 8
interface Kept {
  files: ChangedFile[]
  items: CodeViewDiffItem<undefined>[]
  loadedAt: number
}

// A commit's diff never changes; anything naming a branch or the working tree can.
const fixed = (target: DiffTarget) => target.kind === 'commit' && /^[0-9a-f]{7,40}$/.test(target.sha)

// One file's patch as a diff item, marked with its file's cache key and folded if it is huge; an unchanged
// item from before is reused as the same object, so the view can skip it.
function itemFor(
  text: string,
  byPath: ReadonlyMap<string, ChangedFile>,
  previous: ReadonlyMap<string, CodeViewDiffItem<undefined>>,
): CodeViewDiffItem<undefined> | null {
  const item = toDiffItem(text)
  if (!item) return null
  const file = byPath.get(item.fileDiff.name)
  if (file) {
    item.fileDiff.cacheKey = cacheKeyFor(file)
    item.collapsed = shouldCollapse(file)
  }
  const before = previous.get(item.id)
  return file && before && before.fileDiff.cacheKey === item.fileDiff.cacheKey ? before : item
}

// The diff the server put into the page for the comparison it opens on (server state.ts pageDiff).
export interface Seed {
  key: string
  files: ChangedFile[]
  patch: string
  // Its code colors, as the last page saved them.
  tokens?: SavedTokens
}

export function readSeed(): Seed | null {
  const script = typeof document === 'undefined' ? null : document.getElementById('duck-diff-diff')
  if (!script?.textContent) return null
  try {
    return JSON.parse(script.textContent) as Seed
  } catch {
    return null
  }
}

export function createSession(api: Api, initial: DiffTarget, seed: Seed | null = null): Session {
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
  const kept = new Map<string, Kept>()
  const keep = (target: DiffTarget, value: Kept) => {
    const key = targetKey(target)
    kept.delete(key)
    kept.set(key, value)
    if (kept.size > KEPT) kept.delete(kept.keys().next().value as string)
  }

  // Reads a target's files and patch into diff items. onPartial sees the items so far while git streams;
  // items whose content is unchanged from reuse are kept as the same objects so the view can skip them.
  async function read(
    target: DiffTarget,
    signal: AbortSignal,
    reuse: readonly CodeViewDiffItem<undefined>[],
    onPartial?: (files: ChangedFile[], items: CodeViewDiffItem<undefined>[]) => void,
  ): Promise<Kept | null> {
    // Both requests start together: git can stream the patch while the file list is still being built.
    const diffBody = api.diff(target, signal)
    diffBody.catch(() => {})
    const files = await api.files(target, signal)
    if (signal.aborted) return null
    const byPath = new Map(files.map((file) => [file.path, file]))
    const previous = new Map(reuse.map((item) => [item.id, item]))
    const items: CodeViewDiffItem<undefined>[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    // The first file is published at once so something paints early; after that, 50 ms batches let files
    // appear while git is still streaming without a render per file.
    const flush = () => {
      flushTimer = null
      if (!signal.aborted) onPartial?.(files, [...items])
    }
    await readPatchStream(
      await diffBody,
      (text) => {
        const item = itemFor(text, byPath, previous)
        if (!item) return
        items.push(item)
        if (!onPartial) return
        if (items.length === 1) flush()
        else flushTimer ??= setTimeout(flush, 50)
      },
      signal,
    )
    if (flushTimer) clearTimeout(flushTimer)
    if (signal.aborted) return null
    const value = { files, items, loadedAt: Date.now() }
    keep(target, value)
    return value
  }

  // The opening diff, when the page came with it: drawn in the first frame, no request in between.
  if (seed && seed.key === targetKey(initial)) {
    const byPath = new Map(seed.files.map((file) => [file.path, file]))
    const items: CodeViewDiffItem<undefined>[] = []
    const splitter = createPatchSplitter((text) => {
      const item = itemFor(text, byPath, new Map())
      if (item) items.push(item)
    })
    splitter.push(seed.patch)
    splitter.finish()
    const value = { files: seed.files, items, loadedAt: Date.now() }
    keep(initial, value)
    store.set((prev) => ({ ...prev, ...value, status: 'ready' }))
  }

  async function load(target: DiffTarget) {
    current?.abort()
    const controller = new AbortController()
    current = controller
    const memory = kept.get(targetKey(target))
    if (memory) {
      // Seen before: shown at once, then refreshed quietly unless it cannot have changed.
      store.set((prev) => ({ ...prev, target, ...memory, status: 'ready', error: null, streaming: false }))
      if (fixed(target)) return
    } else store.set((prev) => ({ ...prev, target, status: 'loading', error: null }))
    try {
      // A quiet refresh swaps the new diff in once at the end instead of growing it file by file.
      const partial = memory
        ? undefined
        : (files: ChangedFile[], items: CodeViewDiffItem<undefined>[]) =>
            store.set((prev) => ({ ...prev, files, items, streaming: true }))
      const done = await read(target, controller.signal, store.get().items, partial)
      if (!done) return
      store.set((prev) => ({ ...prev, ...done, status: 'ready', streaming: false }))
    } catch (error) {
      // A failed quiet refresh leaves the diff that is showing.
      if (controller.signal.aborted || memory) return
      store.set((prev) => ({ ...prev, status: 'error', error: (error as Error).message, streaming: false }))
    }
  }

  // Reads a diff into memory ahead of time, so opening it later is instant. One at a time, and never
  // over a load the page is waiting for.
  let warming: AbortController | null = null
  function prefetch(target: DiffTarget) {
    if (kept.has(targetKey(target)) || targetKey(target) === targetKey(store.get().target)) return
    warming?.abort()
    const controller = new AbortController()
    warming = controller
    read(target, controller.signal, []).catch(() => {})
  }

  return { ...store, load, prefetch, reload: () => load(store.get().target) }
}
