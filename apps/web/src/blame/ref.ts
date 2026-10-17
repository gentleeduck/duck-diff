import type { DiffTarget } from '@duck-diff/protocol'

export interface BlameAt {
  ref?: string
  // Blame at the merge-base of ref and this, for the old side of a three-dot comparison.
  mergeBase?: string
}

// The version each side of a comparison is blamed at: the new side at the commit or the working file, the old
// side at what it was compared with. Staged changes have no new side to blame: the index can differ from the
// working file line by line.
export function blameSides(target: DiffTarget): { old: BlameAt; new: BlameAt | null } {
  switch (target.kind) {
    case 'commit':
      return { old: { ref: `${target.sha}^` }, new: { ref: target.sha } }
    case 'range':
      return {
        old: target.mode === 'merge-base' ? { ref: target.to, mergeBase: target.from } : { ref: target.from },
        new: { ref: target.to },
      }
    case 'staged':
      return { old: { ref: target.base ?? 'HEAD' }, new: null }
    case 'local':
      return { old: { ref: target.base ?? 'HEAD' }, new: {} }
    default:
      return { old: { ref: 'HEAD' }, new: {} }
  }
}
