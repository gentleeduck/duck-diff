import type { DiffTarget } from '@duck-diff/protocol'

// The version blame is read at: the commit for a commit or a range, the working file for local changes.
// Staged changes have none, since the index can differ from the working file line by line.
export function blameRef(target: DiffTarget): string | null | undefined {
  if (target.kind === 'commit') return target.sha
  if (target.kind === 'range') return target.to
  if (target.kind === 'staged') return null
  return undefined
}
