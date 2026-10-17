import { type ChangedFile, type DiffTarget, targetKey } from '@duck-diff/protocol'
import { z } from 'zod'
import { onSavedElsewhere, saved } from '../lib/saved'
import { createStore, type Store } from '../lib/store'

const KEY = 'duck-diff:viewed'

// Target key to marks; a mark carries the content sha so an edited file counts as unviewed again.
export type ViewedState = Record<string, string[]>

export interface Viewed extends Store<ViewedState> {
  toggle(target: DiffTarget, file: ChangedFile): void
  // Moves to the repository's own marks once the page knows which one it shows.
  restore(repo: string): void
}

function mark(file: ChangedFile): string {
  return `${file.path}@${file.newSha ?? file.oldSha ?? ''}`
}

export function viewedPaths(state: ViewedState, target: DiffTarget, files: readonly ChangedFile[]): Set<string> {
  const marks = new Set(state[targetKey(target)] ?? [])
  return new Set(files.filter((file) => marks.has(mark(file))).map((file) => file.path))
}

function load(storage: Pick<Storage, 'getItem'> | null, key: string): ViewedState | null {
  try {
    const text = storage?.getItem(key)
    if (text == null) return null
    const parsed = z.record(z.string(), z.array(z.string())).safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function createViewedStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = saved): Viewed {
  // Until the repository is known the marks are the list every repository shared before they were kept apart.
  let key = KEY
  const store = createStore(load(storage, key) ?? {})
  let fromElsewhere = false
  const listen = (watched: string) =>
    onSavedElsewhere(storage, watched, () => {
      if (watched !== key) return
      fromElsewhere = true
      try {
        store.set(load(storage, key) ?? {})
      } finally {
        fromElsewhere = false
      }
    })
  listen(KEY)
  store.subscribe(() => {
    if (fromElsewhere) return
    try {
      storage?.setItem(key, JSON.stringify(store.get()))
    } catch {
      // Private windows and full quotas refuse writes; viewed marks still work for this session.
    }
  })
  return {
    ...store,
    restore(repo) {
      key = `${KEY}:${repo}`
      listen(key)
      // A repository with no marks of its own yet starts from the shared list, so nothing marked is lost.
      const own = load(storage, key)
      if (own) store.set(own)
      else storage?.setItem(key, JSON.stringify(store.get()))
    },
    toggle(target, file) {
      const diff = targetKey(target)
      const own = mark(file)
      store.set((prev) => {
        const marks = (prev[diff] ?? []).filter((entry) => !entry.startsWith(`${file.path}@`))
        const wasViewed = prev[diff]?.includes(own) ?? false
        return { ...prev, [diff]: wasViewed ? marks : [...marks, own] }
      })
    },
  }
}
