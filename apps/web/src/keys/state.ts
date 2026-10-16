import { onSavedElsewhere, saved } from '../lib/saved'
import { createStore, type Store } from '../lib/store'
import type { Overrides } from './bindings'
import type { Mode } from './engine'

export interface KeyState {
  mode: Mode
  // Keys typed toward a chord, shown in the status bar like vim's showcmd.
  pending: string[]
  commandLine: boolean
  // The searchable keymaps list.
  picker: boolean
  // Lines are selected in the diff, which is vim's visual mode.
  visual: boolean
}

export const createKeyState = (): Store<KeyState> =>
  createStore<KeyState>({ mode: 'normal', pending: [], commandLine: false, picker: false, visual: false })

const KEY = 'duck-diff:keys'

export interface KeyOverrides extends Store<Overrides> {
  // null puts the command back on its default keys.
  bind(id: string, keys: string[] | null): void
}

function read(storage: Pick<Storage, 'getItem'> | null): Overrides {
  const overrides: Overrides = {}
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? '{}') as unknown
    if (parsed && typeof parsed === 'object') {
      for (const [id, keys] of Object.entries(parsed)) {
        if (Array.isArray(keys) && keys.every((key) => typeof key === 'string')) overrides[id] = keys
      }
    }
  } catch {
    return {}
  }
  return overrides
}

export function createKeyOverrides(storage: Pick<Storage, 'getItem' | 'setItem'> | null = saved): KeyOverrides {
  const store = createStore(read(storage))
  onSavedElsewhere(storage, KEY, () => store.set(read(storage)))
  return {
    ...store,
    bind(id, keys) {
      store.set((prev) => {
        const next = { ...prev }
        if (keys) next[id] = keys
        else delete next[id]
        return next
      })
      try {
        storage?.setItem(KEY, JSON.stringify(store.get()))
      } catch {}
    },
  }
}
