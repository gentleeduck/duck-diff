import type { ReviewComment } from '@duck-diff/protocol'
import type { FileDiffMetadata } from '@pierre/diffs'

export type Side = 'additions' | 'deletions'

export interface Anchored {
  comment: ReviewComment
  // 0 means the line is gone and the comment shows above the file as outdated.
  line: number
  outdated: boolean
}

const SEARCH = 20

// FNV-1a: small, stable across browsers, and enough to tell a moved line from an edited one.
export function lineHash(text: string): string {
  let hash = 0x811c9dc5
  for (const char of text.trimEnd()) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function lineText(diff: FileDiffMetadata, side: Side, line: number): string | null {
  for (const hunk of diff.hunks) {
    const start = side === 'additions' ? hunk.additionStart : hunk.deletionStart
    const count = side === 'additions' ? hunk.additionCount : hunk.deletionCount
    if (line < start || line >= start + count) continue
    const index = (side === 'additions' ? hunk.additionLineIndex : hunk.deletionLineIndex) + line - start
    return (side === 'additions' ? diff.additionLines : diff.deletionLines)[index] ?? null
  }
  return null
}

function matches(diff: FileDiffMetadata, side: Side, line: number, hash: string): boolean {
  const text = lineText(diff, side, line)
  return text !== null && lineHash(text) === hash
}

export function anchorComments(comments: readonly ReviewComment[], diff: FileDiffMetadata): Anchored[] {
  return comments.map((comment) => {
    const { side, line, lineHash: hash } = comment
    for (let distance = 0; distance <= SEARCH; distance++) {
      for (const candidate of distance === 0 ? [line] : [line - distance, line + distance]) {
        if (candidate >= 1 && matches(diff, side, candidate, hash)) return { comment, line: candidate, outdated: false }
      }
    }
    return { comment, line: 0, outdated: true }
  })
}
