import { saved } from '../lib/saved'
import { createStore, type Store } from '../lib/store'

export interface PanelState {
  open: boolean
  // 'output', or the id of a terminal.
  tab: string
  // The job the Output tab shows; null follows the newest.
  job: string | null
  height: number
}

export interface Panel extends Store<PanelState> {
  toggle(): void
  show(tab?: string, job?: string | null): void
  resize(height: number): void
}

const KEY = 'duck-diff:panel-height'
export const DEFAULT_HEIGHT = 280

function readHeight(storage: Pick<Storage, 'getItem'> | null): number {
  try {
    const stored = Number(storage?.getItem(KEY))
    return stored > 0 ? stored : DEFAULT_HEIGHT
  } catch {
    return DEFAULT_HEIGHT
  }
}

export function createPanel(storage: Pick<Storage, 'getItem' | 'setItem'> | null = saved): Panel {
  const store = createStore<PanelState>({ open: false, tab: 'output', job: null, height: readHeight(storage) })
  return {
    ...store,
    toggle: () => store.set((state) => ({ ...state, open: !state.open })),
    show: (tab, job) =>
      store.set((state) => ({ ...state, open: true, tab: tab ?? state.tab, job: job === undefined ? state.job : job })),
    resize(height) {
      store.set((state) => ({ ...state, height }))
      try {
        storage?.setItem(KEY, String(height))
      } catch {}
    },
  }
}
