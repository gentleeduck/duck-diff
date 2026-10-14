export interface ItemSink<T> {
  addItems(items: readonly T[]): void
  updateItem(item: T): boolean
  removeItem(id: string): boolean
}

// CodeView keeps its own list; this applies the smallest set of calls that turns `previous` into `next`.
export function syncItems<T extends { id: string }>(sink: ItemSink<T>, previous: readonly T[], next: readonly T[]) {
  const nextIds = new Set(next.map((item) => item.id))
  for (const item of previous) if (!nextIds.has(item.id)) sink.removeItem(item.id)
  const kept = previous.filter((item) => nextIds.has(item.id))

  let same = 0
  while (same < kept.length && same < next.length && kept[same]?.id === next[same]?.id) {
    const item = next[same]
    if (item && kept[same] !== item) sink.updateItem(item)
    same++
  }
  // CodeView only appends, so anything after the first reordering is removed and added again.
  for (const item of kept.slice(same)) sink.removeItem(item.id)
  const rest = next.slice(same)
  if (rest.length > 0) sink.addItems(rest)
}
