import {
  abortOperation,
  addRemote,
  checkoutDetached,
  cherryPick,
  cleanUntracked,
  commit,
  continueOperation,
  createTag,
  deleteBranch,
  deleteRemoteBranch,
  deleteTag,
  discardFile,
  discardHunk,
  fetchAll,
  fetchRemote,
  forcePush,
  markResolved,
  mergeRef,
  pull,
  push,
  pushTags,
  rebaseOnto,
  removeRemote,
  renameBranch,
  resetTo,
  resolveConflict,
  restoreLatest,
  revertCommit,
  setUpstream,
  skipCommit,
  snapshot,
  stageAll,
  stageFile,
  stageHunk,
  stashApply,
  stashDrop,
  stashSave,
  stashStaged,
  switchBranch,
  trackRemote,
  undoCommit,
  unmergedPaths,
  unstageAll,
  unstageFile,
  unstageHunk,
  writeResolution,
} from '@duck-diff/git'
import {
  type ChangeReason,
  CheckoutRequestSchema,
  CommitRequestSchema,
  DeleteBranchSchema,
  FetchRemoteSchema,
  MessageSchema,
  NameSchema,
  PathRequestSchema,
  RebaseSchema,
  RefRequestSchema,
  RemoteAddSchema,
  RemoteBranchSchema,
  RenameBranchSchema,
  ResetSchema,
  ResolveSchema,
  ResolveTextSchema,
  StashApplySchema,
  StashDropSchema,
  StashSaveSchema,
  SwitchRequestSchema,
  TagCreateSchema,
  TagPushSchema,
  UpstreamSchema,
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
    case 'resolve':
      await resolveConflict(repo, ResolveSchema.parse(await request.json()))
      return { reason: 'index', body: {} }
    case 'resolve-text': {
      const { path, text } = ResolveTextSchema.parse(await request.json())
      await writeResolution(repo, path, text)
      return { reason: 'index', body: {} }
    }
    case 'mark-resolved':
      await markResolved(repo, PathRequestSchema.parse(await request.json()).path)
      return { reason: 'index', body: {} }
    case 'undo-commit':
      await undoCommit(repo)
      return { reason: 'refs', body: {} }
    case 'reset':
      await resetTo(repo, ResetSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'branch-rename':
      await renameBranch(repo, RenameBranchSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'set-upstream':
      await setUpstream(repo, UpstreamSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'force-push':
      await forcePush(repo)
      return { reason: 'refs', body: {} }
    case 'remote-branch-delete':
      await deleteRemoteBranch(repo, RemoteBranchSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'track':
      await trackRemote(repo, RefRequestSchema.parse(await request.json()).ref)
      return { reason: 'refs', body: {} }
    case 'tag-create':
      await createTag(repo, TagCreateSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'tag-delete':
      await deleteTag(repo, NameSchema.parse(await request.json()).name)
      return { reason: 'refs', body: {} }
    case 'tag-push':
      await pushTags(repo, TagPushSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'remote-add':
      await addRemote(repo, RemoteAddSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'remote-remove':
      await removeRemote(repo, NameSchema.parse(await request.json()).name)
      return { reason: 'refs', body: {} }
    case 'fetch-remote':
      await fetchRemote(repo, FetchRemoteSchema.parse(await request.json()))
      return { reason: 'refs', body: {} }
    case 'rebase':
      return { reason: 'refs', body: await rebaseOnto(repo, RebaseSchema.parse(await request.json()).onto) }
    case 'continue':
      return { reason: 'refs', body: await continueOperation(repo) }
    case 'skip':
      return { reason: 'refs', body: await skipCommit(repo) }
    case 'clean':
      await cleanUntracked(repo)
      return { reason: 'worktree', body: {} }
    case 'stash-staged':
      await stashStaged(repo, MessageSchema.parse(await request.json()).message)
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
