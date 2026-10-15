import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GitError } from './errors'
import { runGit } from './run'

// Network commands can wait on a slow remote; local ones keep the default.
const NETWORK_TIMEOUT_MS = 120_000
// Pull may want to write a merge message; it must never open an editor from a server.
const NO_EDITOR = { GIT_EDITOR: 'true' }

export interface SyncStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  // Files with changes in the index, ready to commit.
  staged: number
  // A merge, cherry-pick, revert or rebase stopped part way, usually on conflicts.
  operation: Operation | null
}

export type Operation = 'merge' | 'cherry-pick' | 'revert' | 'rebase'

// git marks an unfinished operation with these files in the git dir.
const MARKERS: [string, Operation][] = [
  ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
]

async function readOperation(repo: string): Promise<Operation | null> {
  const gitDir = (await runGit(['rev-parse', '--absolute-git-dir'], { cwd: repo })).trim()
  return MARKERS.find(([marker]) => existsSync(join(gitDir, marker)))?.[1] ?? null
}

// `git status --porcelain=v2 --branch` headers: "# branch.head main", "# branch.upstream origin/main", "# branch.ab +1 -2";
// entry lines start "1 XY" (or "2 XY" for renames), where X is the index side.
export async function readSyncStatus(repo: string): Promise<SyncStatus> {
  const [out, operation] = await Promise.all([
    runGit(['status', '--porcelain=v2', '--branch', '--untracked-files=no'], { cwd: repo }),
    readOperation(repo),
  ])
  const status: SyncStatus = { branch: null, upstream: null, ahead: 0, behind: 0, staged: 0, operation }
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice(14)
      status.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) status.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const [ahead = '+0', behind = '-0'] = line.slice(12).split(' ')
      status.ahead = Number(ahead.slice(1))
      status.behind = Number(behind.slice(1))
    } else if (/^[12u] /.test(line) && line[2] !== '.') status.staged++
  }
  return status
}

export async function commit(repo: string, options: { message: string; amend: boolean }): Promise<string> {
  // Finishing a merge or pick may commit a resolution identical to HEAD, so only plain commits need staged files.
  if (!options.amend && !(await readOperation(repo))) {
    const staged = await runGit(['diff', '--cached', '--name-only'], { cwd: repo })
    if (!staged.trim()) throw new GitError('failed', null, '', 'nothing is staged; stage changes before committing')
  }
  await runGit(['commit', '--quiet', '--file=-', ...(options.amend ? ['--amend'] : [])], {
    cwd: repo,
    input: options.message.endsWith('\n') ? options.message : `${options.message}\n`,
  })
  return (await runGit(['rev-parse', 'HEAD'], { cwd: repo })).trim()
}

// A branch without an upstream is published to the first remote and tracks it from then on.
export async function push(repo: string): Promise<void> {
  const { branch, upstream } = await readSyncStatus(repo)
  if (!branch) throw new GitError('failed', null, '', 'HEAD is detached; switch to a branch to push')
  if (upstream) {
    await runGit(['push', '--quiet'], { cwd: repo, timeoutMs: NETWORK_TIMEOUT_MS })
    return
  }
  const remotes = (await runGit(['remote'], { cwd: repo })).split('\n').filter(Boolean)
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!remote) throw new GitError('failed', null, '', 'this repository has no remote to push to')
  await runGit(['push', '--quiet', '--set-upstream', remote, branch], { cwd: repo, timeoutMs: NETWORK_TIMEOUT_MS })
}

export async function pull(repo: string): Promise<void> {
  await runGit(['pull', '--quiet', '--no-edit'], { cwd: repo, timeoutMs: NETWORK_TIMEOUT_MS, env: NO_EDITOR })
}

export async function fetchAll(repo: string): Promise<void> {
  await runGit(['fetch', '--quiet', '--all', '--prune'], { cwd: repo, timeoutMs: NETWORK_TIMEOUT_MS })
}

export async function switchBranch(
  repo: string,
  options: { branch: string; create: boolean; start?: string },
): Promise<void> {
  const args = options.create ? ['switch', '--quiet', '-c', options.branch] : ['switch', '--quiet', options.branch]
  if (options.create && options.start) args.push(options.start)
  await runGit(args, { cwd: repo })
}

export async function checkoutDetached(repo: string, sha: string): Promise<void> {
  await runGit(['switch', '--quiet', '--detach', sha], { cwd: repo })
}

export async function stashSave(repo: string, options: { message: string; untracked: boolean }): Promise<void> {
  const args = ['stash', 'push', '--quiet']
  if (options.untracked) args.push('--include-untracked')
  if (options.message) args.push('-m', options.message)
  await runGit(args, { cwd: repo })
}

// name is git's own stash@{n}, so the entry is addressed exactly as `git stash list` printed it.
export async function stashApply(repo: string, options: { name: string; pop: boolean }): Promise<void> {
  await runGit(['stash', options.pop ? 'pop' : 'apply', '--quiet', options.name], { cwd: repo })
}

export async function stashDrop(repo: string, name: string): Promise<void> {
  await runGit(['stash', 'drop', '--quiet', name], { cwd: repo })
}

// Merges, picks and reverts that stop on conflicts are not failures: the conflicted files go to the
// changes view and the status reports the operation until it is committed or aborted.
async function mayConflict(repo: string, args: string[]): Promise<{ conflicts: boolean }> {
  try {
    await runGit(args, { cwd: repo, env: NO_EDITOR })
    return { conflicts: false }
  } catch (error) {
    if (await readOperation(repo)) return { conflicts: true }
    throw error
  }
}

export function mergeRef(repo: string, ref: string): Promise<{ conflicts: boolean }> {
  return mayConflict(repo, ['merge', '--no-edit', ref])
}

export function cherryPick(repo: string, sha: string): Promise<{ conflicts: boolean }> {
  return mayConflict(repo, ['cherry-pick', sha])
}

export function revertCommit(repo: string, sha: string): Promise<{ conflicts: boolean }> {
  return mayConflict(repo, ['revert', '--no-edit', sha])
}

export async function abortOperation(repo: string): Promise<void> {
  const operation = await readOperation(repo)
  if (!operation) throw new GitError('failed', null, '', 'nothing to abort')
  await runGit([operation, '--abort'], { cwd: repo })
}

// -d refuses a branch that is not merged anywhere; force is the caller's explicit choice.
export async function deleteBranch(repo: string, options: { name: string; force: boolean }): Promise<void> {
  await runGit(['branch', options.force ? '-D' : '-d', options.name], { cwd: repo })
}

export async function stageAll(repo: string): Promise<void> {
  await runGit(['add', '--all'], { cwd: repo })
}

// Works before the first commit too, where there is no HEAD to reset to.
export async function unstageAll(repo: string): Promise<void> {
  const head = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })
  await runGit(head.trim() ? ['reset', '--quiet'] : ['rm', '-r', '--cached', '--quiet', '.'], { cwd: repo })
}
