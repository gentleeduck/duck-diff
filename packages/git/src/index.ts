export { type CheckoutInfo, readCheckout } from './checkout'
export { type Commit, type CommitDetails, type CommitStat, listCommits, readCommit, readCommitStat } from './commits'
export {
  type ConflictBlame,
  type ConflictFile,
  type ConflictSegment,
  conflictBlame,
  hasConflictMarkers,
  type ParsedConflicts,
  parseConflicts,
  readConflict,
  writeResolution,
} from './conflicts'
export { readSide, readSideBytes, type Side } from './content'
export { GitError, type GitErrorCode } from './errors'
export { type ChangedFile, type FileStatus, listFiles, parseDiffSummary, parseNumstat, parseRaw } from './files'
export { GRAPH_FORMAT, type GraphOptions, graphTips, streamGraph } from './graph'
export {
  type BisectState,
  bisectMark,
  bisectReset,
  bisectRun,
  cherryPickRange,
  fixupInto,
  interactiveRebase,
  type PlanCommit,
  type RebaseAction,
  type RebaseStep,
  readBisect,
  rebasePlan,
  todoText,
} from './history'
export { duckHome } from './home'
export { type Insights, readInsights, weekStart } from './insights'
export { buildLinePatch, discardLines, type PickedLine, stageLines, unstageLines } from './line-patch'
export {
  addRemote,
  type BlameLine,
  type BlameText,
  blame,
  blameText,
  cleanUntracked,
  continueOperation,
  createTag,
  deleteRemoteBranch,
  deleteTag,
  fetchRemote,
  forcePush,
  lastMessage,
  listRemotes,
  markResolved,
  pushTags,
  type Remote,
  rebaseOnto,
  removeRemote,
  renameBranch,
  resetTo,
  resolveConflict,
  setUpstream,
  skipCommit,
  stashStaged,
  trackRemote,
  undoCommit,
} from './ops'
export { getPatch, streamDiff, streamPatch } from './patch'
export { listRefs, type Ref, type RefKind } from './refs'
export { resolveRepo } from './repo'
export { resolveRevision } from './revision'
export { type OutputSink, type RunOptions, runGit, streamGit, withOutput } from './run'
export { classify, findSymbol, SYMBOL_NAME, type SymbolHit, type SymbolKind, type SymbolResult } from './symbols'
export {
  abortOperation,
  checkoutDetached,
  cherryPick,
  commit,
  deleteBranch,
  fetchAll,
  mergeRef,
  type Operation,
  pull,
  push,
  readOperation,
  readSyncStatus,
  revertCommit,
  type SyncStatus,
  stageAll,
  stashApply,
  stashDrop,
  stashSave,
  switchBranch,
  unstageAll,
} from './sync'
export { type DiffTarget, targetArgs, unmergedPaths } from './target'
export { parseTodo, readTodo, snapshotCommit, writeTodo } from './tools'
export { type FileContents, listTree, readTreeBytes, readTreeFile, type TreeRef } from './tree'
export { repoId, restoreLatest, snapshot } from './undo'
export {
  addWorktree,
  listSubmodules,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
  type Submodule,
  type SubmoduleCommit,
  submoduleLog,
  syncSubmodules,
  updateSubmodules,
  type Worktree,
} from './worktrees'
export {
  discardFile,
  discardHunk,
  splitPatch,
  stageFile,
  stageHunk,
  unstageFile,
  unstageHunk,
} from './write'
