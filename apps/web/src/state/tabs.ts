import { type DiffTarget, DiffTargetSchema, targetKey } from '@duck-diff/protocol'
import { createStore, type Store } from '../lib/store'

export interface DiffTab {
  id: string
  target: DiffTarget
  // The file the tab was last at, so coming back to it lands there again.
  path: string | null
}

export interface TabsState {
  // The first tab is the working tree and always stays first.
  tabs: DiffTab[]
  active: string
}

export const ROOT = 'root'
const KEY = 'duck-diff:tabs:'

// Working-tree comparisons share the root tab; everything else gets a tab of its own.
export const isWorkingTree = (target: DiffTarget) =>
  target.kind === 'local' || target.kind === 'staged' || target.kind === 'unstaged'

export interface Tabs extends Store<TabsState> {
  // Where a target goes: the root tab for the working tree, its own tab (found or new) otherwise.
  open(target: DiffTarget): DiffTab
  activate(id: string): DiffTab | null
  // Closing the active tab moves to its neighbour, which is returned so its diff can load.
  close(id: string): DiffTab | null
  move(id: string, before: string | null): void
  rememberPath(path: string | null): void
  // Brings back the tabs saved for a repository, keeping the one open now.
  restore(repo: string, storage?: Pick<Storage, 'getItem' | 'setItem'> | null): void
}

let counter = 0
const newId = () => `tab-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function createTabs(initial: DiffTarget): Tabs {
  const root: DiffTab = { id: ROOT, target: isWorkingTree(initial) ? initial : { kind: 'local' }, path: null }
  const first: TabsState = isWorkingTree(initial)
    ? { tabs: [root], active: ROOT }
    : (() => {
        const tab = { id: newId(), target: initial, path: null }
        return { tabs: [root, tab], active: tab.id }
      })()
  const store = createStore<TabsState>(first)
  let save: (() => void) | null = null
  const set: Store<TabsState>['set'] = (next) => {
    store.set(next)
    save?.()
  }
  const find = (id: string) => store.get().tabs.find((tab) => tab.id === id) ?? null

  return {
    ...store,
    set,
    open(target) {
      const { tabs } = store.get()
      if (isWorkingTree(target)) {
        set({ tabs: tabs.map((tab) => (tab.id === ROOT ? { ...tab, target } : tab)), active: ROOT })
        return find(ROOT) as DiffTab
      }
      const key = targetKey(target)
      const existing = tabs.find((tab) => tab.id !== ROOT && targetKey(tab.target) === key)
      if (existing) {
        set({ tabs, active: existing.id })
        return existing
      }
      const tab: DiffTab = { id: newId(), target, path: null }
      set({ tabs: [...tabs, tab], active: tab.id })
      return tab
    },
    activate(id) {
      const tab = find(id)
      if (tab) set((state) => ({ ...state, active: id }))
      return tab
    },
    close(id) {
      if (id === ROOT) return null
      const { tabs, active } = store.get()
      const at = tabs.findIndex((tab) => tab.id === id)
      if (at === -1) return null
      const rest = tabs.filter((tab) => tab.id !== id)
      const next = active === id ? (rest[at - 1] ?? rest[at] ?? rest[0]) : (find(active) ?? rest[0])
      set({ tabs: rest, active: next?.id ?? ROOT })
      return active === id ? (next ?? null) : null
    },
    move(id, before) {
      if (id === ROOT || id === before) return
      const { tabs, active } = store.get()
      const moving = tabs.find((tab) => tab.id === id)
      if (!moving) return
      const rest = tabs.filter((tab) => tab.id !== id)
      // Nothing goes ahead of the root tab.
      const at =
        before === null || before === ROOT
          ? rest.length
          : Math.max(
              1,
              rest.findIndex((tab) => tab.id === before),
            )
      set({ tabs: [...rest.slice(0, at), moving, ...rest.slice(at)], active })
    },
    rememberPath(path) {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === state.active && tab.path !== path ? { ...tab, path } : tab)),
      }))
    },
    restore(repo, storage = typeof localStorage === 'undefined' ? null : localStorage) {
      const key = KEY + repo
      try {
        const saved = JSON.parse(storage?.getItem(key) ?? '[]') as unknown[]
        const { tabs, active } = store.get()
        const have = new Set(tabs.map((tab) => targetKey(tab.target)))
        const back: DiffTab[] = []
        for (const entry of Array.isArray(saved) ? saved : []) {
          const parsed = DiffTargetSchema.safeParse((entry as { target?: unknown })?.target)
          if (!parsed.success || isWorkingTree(parsed.data) || have.has(targetKey(parsed.data))) continue
          have.add(targetKey(parsed.data))
          const path = (entry as { path?: unknown }).path
          back.push({ id: newId(), target: parsed.data, path: typeof path === 'string' ? path : null })
        }
        if (back.length) store.set({ tabs: [tabs[0] as DiffTab, ...back, ...tabs.slice(1)], active })
      } catch {}
      save = () => {
        try {
          const kept = store
            .get()
            .tabs.slice(1)
            .map(({ target, path }) => ({ target, path }))
          storage?.setItem(key, JSON.stringify(kept))
        } catch {}
      }
      save()
    },
  }
}
