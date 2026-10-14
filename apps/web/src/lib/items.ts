import type { ChangedFile } from '@duck-diff/protocol'
import { type CodeViewDiffItem, processFile } from '@pierre/diffs'

export function itemId(path: string): string {
  return `diff:${path}`
}

export function cacheKeyFor(file: ChangedFile): string {
  return `${file.path}:${file.oldSha}:${file.newSha}`
}

export function toDiffItem(text: string, file?: ChangedFile): CodeViewDiffItem<undefined> | null {
  // processFile accepts anything and returns an unnamed entry, so reject non-patch text up front.
  if (!text.startsWith('diff --git ')) return null
  const fileDiff = processFile(text, { isGitDiff: true, cacheKey: file ? cacheKeyFor(file) : undefined })
  if (!fileDiff?.name) return null
  fileDiff.cacheKey ??= `${fileDiff.name}:${text.length}`
  return { id: itemId(fileDiff.name), type: 'diff', fileDiff, version: 0 }
}
