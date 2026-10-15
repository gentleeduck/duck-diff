import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'

export interface TerminalTab {
  key: string
  // The server's id, known once the shell has started; null for a tab still opening.
  id: string | null
  // Terminal 1, 2...: fixed, so keys and tests can find it.
  name: string
  // What the shell calls itself (its window title), shown on the tab.
  title: string
}

export interface TerminalTabs extends Store<{ tabs: TerminalTab[] }> {
  load(): Promise<void>
  add(): TerminalTab
  setId(key: string, id: string): void
  rename(key: string, title: string): void
  remove(key: string): void
  // Ends the shell too, like closing a kitty window.
  close(key: string): void
}

let counter = 0

export function createTerminalTabs(api: Pick<Api, 'terminals' | 'closeTerminal'>): TerminalTabs {
  const store = createStore<{ tabs: TerminalTab[] }>({ tabs: [] })
  let numbered = 0
  const update = (key: string, change: Partial<TerminalTab>) =>
    store.set(({ tabs }) => ({ tabs: tabs.map((tab) => (tab.key === key ? { ...tab, ...change } : tab)) }))
  const remove = (key: string) => store.set(({ tabs }) => ({ tabs: tabs.filter((tab) => tab.key !== key) }))

  return {
    ...store,
    async load() {
      const running = await api.terminals()
      const known = new Set(store.get().tabs.map((tab) => tab.id))
      const back = running
        .filter((terminal) => !known.has(terminal.id))
        .map((terminal) => {
          const name = `Terminal ${++numbered}`
          return { key: terminal.id, id: terminal.id, name, title: name }
        })
      if (back.length) store.set(({ tabs }) => ({ tabs: [...back, ...tabs] }))
    },
    add() {
      const name = `Terminal ${++numbered}`
      const tab = { key: `new-${(counter++).toString(36)}`, id: null, name, title: name }
      store.set(({ tabs }) => ({ tabs: [...tabs, tab] }))
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
  }
}
