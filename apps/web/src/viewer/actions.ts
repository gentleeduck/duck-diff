import type { ChangedFile, DiffTarget, WriteRequest } from '@duck-diff/protocol'
import type { Hunk } from '@pierre/diffs'

export type WriteKind = 'stage' | 'unstage' | 'discard'

// Only comparisons against the index can be written back; everything else is read-only.
export function actionsFor(target: DiffTarget): WriteKind[] {
  if (target.kind === 'unstaged') return ['stage', 'discard']
  if (target.kind === 'staged') return ['unstage']
  return []
}

export function hunkAt(hunks: readonly Hunk[], line: number, side: 'additions' | 'deletions'): number | null {
  const index = hunks.findIndex((hunk) => {
    const start = side === 'additions' ? hunk.additionStart : hunk.deletionStart
    const count = side === 'additions' ? hunk.additionCount : hunk.deletionCount
    return line >= start && line < start + Math.max(count, 1)
  })
  return index === -1 ? null : index
}

export function hunkHeader(hunk: Hunk): string {
  return (hunk.hunkSpecs ?? '').replace(/\n$/, '')
}

export function writeRequest(kind: WriteKind, file: ChangedFile, target?: { index: number; hunk: Hunk }): WriteRequest {
  const payload = { path: file.path, oldPath: file.oldPath, status: file.status, newSha: file.newSha }
  if (target) {
    return { action: `${kind}-hunk`, file: payload, hunkIndex: target.index, hunkHeader: hunkHeader(target.hunk) }
  }
  return { action: `${kind}-file`, file: payload }
}
