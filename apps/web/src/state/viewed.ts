import { type ChangedFile, type DiffTarget, targetKey } from '@duck-diff/protocol'
import { z } from 'zod'
import { onSavedElsewhere, saved } from '../lib/saved'
import { createStore, type Store } from '../lib/store'

const KEY = 'duck-diff:viewed'

// Target key to marks; a mark carries the content sha so an edited file counts as unviewed again.
export type ViewedState = Record<string, string[]>

export interface Viewed extends Store<ViewedState> {
  toggle(target: DiffTarget, file: ChangedFile): void
}

function mark(file: ChangedFile): string {
  return `${file.path}@${file.newSha ?? file.oldSha ?? ''}`
}

export function viewedPaths(state: ViewedState, target: DiffTarget, files: readonly ChangedFile[]): Set<string> {
  const marks = new Set(state[targetKey(target)] ?? [])
  return new Set(files.filter((file) => marks.has(mark(file))).map((file) => file.path))
}

function load(storage: Pick<Storage, 'getItem'> | null): ViewedState {
  try {
    const parsed = z.record(z.string(), z.array(z.string())).safeParse(JSON.parse(storage?.getItem(KEY) ?? '{}'))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export function createViewedStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = saved): Viewed {
  const store = createStore(load(storage))
  let fromElsewhere = false
  onSavedElsewhere(storage, KEY, () => {
    fromElsewhere = true
    try {
      store.set(load(storage))
    } finally {
      fromElsewhere = false
    }
  })
  store.subscribe(() => {
    if (fromElsewhere) return
    try {
      storage?.setItem(KEY, JSON.stringify(store.get()))
    } catch {
      // Private windows and full quotas refuse writes; viewed marks still work for this session.
    }
  })
  return {
    ...store,
    toggle(target, file) {
      const key = targetKey(target)
      const own = mark(file)
      store.set((prev) => {
        const marks = (prev[key] ?? []).filter((entry) => !entry.startsWith(`${file.path}@`))
        const wasViewed = prev[key]?.includes(own) ?? false
        return { ...prev, [key]: wasViewed ? marks : [...marks, own] }
      })
    },
  }
}
