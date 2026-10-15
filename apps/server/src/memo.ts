// Answers that only change when the repo does (a diff, its file list), kept in memory so a reload or a tab
// coming back is answered at once. Any change the watcher or a write reports drops them all.
export interface RepoMemo {
  // Taken before computing; an answer whose stamp is older than the last change is not kept.
  stamp(): number
  get(key: string): string | undefined
  set(key: string, value: string, stamp: number): void
  changed(): void
}

export function createRepoMemo(size = 8): RepoMemo {
  let generation = 0
  const entries = new Map<string, string>()
  return {
    stamp: () => generation,
    get(key) {
      const value = entries.get(key)
      if (value === undefined) return undefined
      // Most recently used last, so the oldest is the first to go.
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key, value, stamp) {
      if (stamp !== generation) return
      entries.delete(key)
      entries.set(key, value)
      while (entries.size > size) entries.delete(entries.keys().next().value as string)
    },
    changed() {
      generation++
      entries.clear()
    },
  }
}
