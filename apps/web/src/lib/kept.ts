import { type SetStateAction, useCallback, useRef, useState } from 'react'
import type { Store } from './store'

// What this tab shows (the bottom panel, tabs, filters, folded folders, drafts) comes back after a reload: it is
// kept in sessionStorage, which a reload keeps and a new tab starts without.
const PREFIX = 'duck-diff:kept:'

export function readKept<T>(name: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + name)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeKept(name: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(PREFIX + name, JSON.stringify(value))
  } catch {}
}

export function dropKept(name: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + name)
  } catch {}
}

// useState that a reload keeps. A null name keeps nothing; a new name starts from what that name kept.
export function useKept<T>(name: string | null, initial: T): [T, (next: SetStateAction<T>) => void] {
  const first = useRef(initial)
  const read = useCallback((key: string | null) => (key === null ? first.current : readKept(key, first.current)), [])
  const [state, setState] = useState(() => ({ name, value: read(name) }))
  const value = state.name === name ? state.value : read(name)
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setState((prev) => {
        const current = prev.name === name ? prev.value : read(name)
        const value = typeof next === 'function' ? (next as (prev: T) => T)(current) : next
        if (name !== null) writeKept(name, value)
        return { name, value }
      }),
    [name, read],
  )
  return [value, set]
}

// Keeps the part of a store that save picks, and puts it back through load when the page starts.
export function keepStore<T, K>(store: Store<T>, name: string, save: (state: T) => K, load: (kept: K, state: T) => T) {
  const kept = readKept<K | undefined>(name, undefined)
  if (kept !== undefined) {
    try {
      store.set((state) => load(kept, state))
    } catch {}
  }
  let last = JSON.stringify(save(store.get()))
  return store.subscribe(() => {
    const next = JSON.stringify(save(store.get()))
    if (next === last) return
    last = next
    try {
      window.sessionStorage.setItem(PREFIX + name, next)
    } catch {}
  })
}
