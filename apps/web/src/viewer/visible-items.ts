import type { CodeViewDiffItem } from '@pierre/diffs'
import { treeOrder } from '../sidebar/tree-model'

// What the diff shows, in the tree's order, without hidden files. j/k walks the same list.
export function visibleItems<T extends CodeViewDiffItem<unknown>>(
  items: readonly T[],
  hidden: (path: string) => boolean,
): T[] {
  const kept = items.filter((item) => !hidden(item.fileDiff.name))
  const order = treeOrder(kept.map((item) => item.fileDiff.name))
  return kept.sort((a, b) => (order.get(a.fileDiff.name) ?? 0) - (order.get(b.fileDiff.name) ?? 0))
}
