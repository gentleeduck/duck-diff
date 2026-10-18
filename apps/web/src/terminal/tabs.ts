import type { Api } from '../lib/api'
import { readKept, writeKept } from '../lib/kept'
import { createStore, type Store } from '../lib/store'

export interface TerminalTab {
  key: string
  // The server's id, known once the shell has started; null for a tab still opening.
  id: string | null
  // Terminal 1, 2...: fixed, so its tab and tests can find it.
  name: string
  // What the shell calls itself (its window title), shown on the tab.
  title: string
}

export interface TerminalTabsState {
  tabs: TerminalTab[]
  // The shells still running on the server are back; until then a tab the panel shows may yet appear.
  loaded: boolean
}

export interface TerminalTabs extends Store<TerminalTabsState> {
  load(): Promise<void>
  add(): TerminalTab
  setId(key: string, id: string): void
  rename(key: string, title: string): void
  remove(key: string): void
  // Ends the shell too, like closing a kitty window.
  close(key: string): void
  // Types a command into the newest terminal (a new one if none) and returns its key.
  run(command: string): string
  // Input waiting for a terminal to connect, handed over once.
  take(key: string): string
}

let counter = 0
const KEPT = 'terminals'
type KeptTab = Pick<TerminalTab, 'key' | 'id' | 'name' | 'title'>

export function createTerminalTabs(api: Pick<Api, 'terminals' | 'closeTerminal'>): TerminalTabs {
  const store = createStore<TerminalTabsState>({ tabs: [], loaded: false })
  // The tabs as they were before a reload: their order, fixed names and shell titles.
  const kept = readKept<KeptTab[]>(KEPT, [])
  let numbered = Math.max(0, ...kept.map((tab) => Number(/\d+$/.exec(tab.name)?.[0] ?? 0)))
  store.subscribe(() => {
    const { tabs, loaded } = store.get()
    if (loaded)
      writeKept(
        KEPT,
        tabs.filter((tab) => tab.id).map(({ key, id, name, title }) => ({ key, id, name, title })),
      )
  })
  const update = (key: string, change: Partial<TerminalTab>) =>
    store.set((state) => ({ ...state, tabs: state.tabs.map((tab) => (tab.key === key ? { ...tab, ...change } : tab)) }))
  const queued = new Map<string, string>()
  const remove = (key: string) =>
    store.set((state) => ({ ...state, tabs: state.tabs.filter((tab) => tab.key !== key) }))

  const tabs: TerminalTabs = {
    ...store,
    async load() {
      const running = await api.terminals().catch((error: unknown) => {
        store.set((state) => ({ ...state, loaded: true }))
        throw error
      })
      const known = new Set(store.get().tabs.map((tab) => tab.id))
      // In the order and with the names they had before the reload; a shell opened elsewhere goes after them.
      const rank = (id: string) => {
        const at = kept.findIndex((tab) => tab.id === id)
        return at === -1 ? kept.length : at
      }
      const back = running
        .filter((terminal) => !known.has(terminal.id))
        .sort((a, b) => rank(a.id) - rank(b.id))
        .map((terminal) => {
          const before = kept.find((tab) => tab.id === terminal.id)
          const name = before?.name ?? `Terminal ${++numbered}`
          // The same key as before, which the bottom panel remembers as its tab.
          return { key: before?.key ?? terminal.id, id: terminal.id, name, title: before?.title ?? name }
        })
      store.set((state) => ({ tabs: [...back, ...state.tabs], loaded: true }))
    },
    add() {
      const name = `Terminal ${++numbered}`
      // Unique across reloads, since a kept tab keeps its key.
      const tab = { key: `new-${Date.now().toString(36)}-${(counter++).toString(36)}`, id: null, name, title: name }
      store.set((state) => ({ ...state, tabs: [...state.tabs, tab] }))
      return tab
    },
    setId: (key, id) => update(key, { id }),
    rename: (key, title) => update(key, { title }),
    remove,
    close(key) {
      const tab = store.get().tabs.find((entry) => entry.key === key)
      if (tab?.id) api.closeTerminal(tab.id).catch(() => {})
      remove(key)
    },
    run(command) {
      const key = store.get().tabs.at(-1)?.key ?? tabs.add().key
      queued.set(key, `${queued.get(key) ?? ''}${command}\r`)
      store.set((state) => ({ ...state }))
      return key
    },
    take(key) {
      const input = queued.get(key) ?? ''
      queued.delete(key)
      return input
    },
  }
  return tabs
}
