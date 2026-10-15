import type { CodeViewDiffItem } from '@pierre/diffs'
import { isTestFile } from '../lib/tests'
import { treeOrder } from '../sidebar/tree-model'
import type { Settings } from '../state/settings'

// What the diff shows, in the tree's order, without test files when they are hidden. j/k walks the same list.
export function visibleItems<T extends CodeViewDiffItem<unknown>>(items: readonly T[], tests: Settings['tests']): T[] {
  const kept = tests === 'hide' ? items.filter((item) => !isTestFile(item.fileDiff.name)) : [...items]
  const order = treeOrder(kept.map((item) => item.fileDiff.name))
  return kept.sort((a, b) => (order.get(a.fileDiff.name) ?? 0) - (order.get(b.fileDiff.name) ?? 0))
}
