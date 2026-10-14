import {
  discardFile,
  discardHunk,
  restoreLatest,
  snapshot,
  stageFile,
  stageHunk,
  unstageFile,
  unstageHunk,
} from '@duck-diff/git'
import type { WriteRequest } from '@duck-diff/protocol'

// Writes touch the index and working tree, so they run one at a time in arrival order.
export function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task)
    tail = run.catch(() => {})
    return run
  }
}

export async function applyWrite(repo: string, request: WriteRequest, undoCache?: string): Promise<void> {
  const { file } = request
  switch (request.action) {
    case 'stage-hunk':
      return stageHunk(repo, file, request.hunkIndex, request.hunkHeader)
    case 'unstage-hunk':
      return unstageHunk(repo, file, request.hunkIndex, request.hunkHeader)
    case 'discard-hunk':
      await snapshot(repo, [file.path], undoCache)
      return discardHunk(repo, file, request.hunkIndex, request.hunkHeader)
    case 'stage-file':
      return stageFile(repo, file)
    case 'unstage-file':
      return unstageFile(repo, file)
    case 'discard-file':
      await snapshot(repo, [file.path], undoCache)
      return discardFile(repo, file)
  }
}

export function undoLatest(repo: string, undoCache?: string) {
  return restoreLatest(repo, undoCache)
}
