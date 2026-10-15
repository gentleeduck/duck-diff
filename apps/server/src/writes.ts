import {
  abortOperation,
  checkoutDetached,
  cherryPick,
  commit,
  deleteBranch,
  discardFile,
  discardHunk,
  fetchAll,
  mergeRef,
  pull,
  push,
  restoreLatest,
  revertCommit,
  snapshot,
  stageAll,
  stageFile,
  stageHunk,
  stashApply,
  stashDrop,
  stashSave,
  switchBranch,
  unmergedPaths,
  unstageAll,
  unstageFile,
  unstageHunk,
} from '@duck-diff/git'
import {
  type ChangeReason,
  CheckoutRequestSchema,
  CommitRequestSchema,
  DeleteBranchSchema,
  RefRequestSchema,
  StashApplySchema,
  StashDropSchema,
  StashSaveSchema,
  SwitchRequestSchema,
  type WriteRequest,
} from '@duck-diff/protocol'
import { HttpError } from './errors'

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
  // Checked against git rather than the page, which may not know the file is conflicted yet.
  if ((await unmergedPaths(repo, { kind: 'unstaged' })).includes(file.path)) {
    throw new HttpError(409, 'bad-request', `${file.path} has a merge conflict; resolve it in your editor first`)
  }
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

// Commit, sync and branch commands; the reason tells open pages what to reload.
export async function gitAction(
  repo: string,
  action: string,
  request: Request,
): Promise<{ reason: ChangeReason; body: Record<string, unknown> }> {
  switch (action) {
    case 'commit': {
      const sha = await commit(repo, CommitRequestSchema.parse(await request.json()))
      return { reason: 'refs', body: { sha } }
    }
    case 'push':
      await push(repo)
      return { reason: 'refs', body: {} }
    case 'pull':
      await pull(repo)
      return { reason: 'refs', body: {} }
    case 'fetch':
      await fetchAll(repo)
      return { reason: 'refs', body: {} }
    case 'switch':
      await switchBranch(repo, SwitchRequestSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'checkout':
      await checkoutDetached(repo, CheckoutRequestSchema.parse(await request.json()).sha)
      return { reason: 'refs', body: {} }
    case 'merge': {
      const { conflicts } = await mergeRef(repo, RefRequestSchema.parse(await request.json()).ref)
      return { reason: 'refs', body: { conflicts } }
    }
    case 'cherry-pick': {
      const { conflicts } = await cherryPick(repo, RefRequestSchema.parse(await request.json()).ref)
      return { reason: 'refs', body: { conflicts } }
    }
    case 'revert': {
      const { conflicts } = await revertCommit(repo, RefRequestSchema.parse(await request.json()).ref)
      return { reason: 'refs', body: { conflicts } }
    }
    case 'abort':
      await abortOperation(repo)
      return { reason: 'refs', body: {} }
    case 'branch-delete':
      await deleteBranch(repo, DeleteBranchSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'stage-all':
      await stageAll(repo)
      return { reason: 'index', body: {} }
    case 'unstage-all':
      await unstageAll(repo)
      return { reason: 'index', body: {} }
    case 'stash':
      await stashSave(repo, StashSaveSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'stash-apply':
      await stashApply(repo, StashApplySchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'stash-drop':
      await stashDrop(repo, StashDropSchema.parse(await request.json()).name)
      return { reason: 'refs', body: {} }
    default:
      throw new HttpError(404, 'not-found', `no git action ${action}`)
  }
}
