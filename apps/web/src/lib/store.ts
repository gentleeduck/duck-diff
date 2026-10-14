import { useCallback, useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

// Components re-render only when their selected slice changes.
export function useStore<T, S>(store: Store<T>, select: (state: T) => S): S {
  const getSnapshot = useCallback(() => select(store.get()), [store, select])
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
