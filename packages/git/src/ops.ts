import { GitError } from './errors'
import { runGit } from './run'
import { mayConflict, NETWORK_TIMEOUT_MS, NO_EDITOR, readOperation } from './sync'

const network = (repo: string) => ({ cwd: repo, timeoutMs: NETWORK_TIMEOUT_MS })

// A conflicted file takes one side whole, then counts as resolved.
export async function resolveConflict(repo: string, options: { path: string; side: 'ours' | 'theirs' }) {
  await runGit(['checkout', `--${options.side}`, '--', options.path], { cwd: repo })
  await runGit(['add', '--', options.path], { cwd: repo })
}

export async function markResolved(repo: string, path: string) {
  await runGit(['add', '--', path], { cwd: repo })
}

// The commit's changes go back to the index, so nothing is lost and it can be recommitted.
export async function undoCommit(repo: string) {
  const parent = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD^'], { cwd: repo, okExitCodes: [1] })
  if (!parent.trim()) throw new GitError('failed', null, '', 'the first commit has nothing before it to go back to')
  await runGit(['reset', '--soft', 'HEAD^'], { cwd: repo })
}

export async function resetTo(repo: string, options: { sha: string; mode: 'soft' | 'mixed' | 'hard' }) {
  await runGit(['reset', '--quiet', `--${options.mode}`, options.sha], { cwd: repo })
}

export async function lastMessage(repo: string): Promise<string> {
  return (await runGit(['log', '-1', '--format=%B'], { cwd: repo })).trimEnd()
}

export async function renameBranch(repo: string, options: { from: string; to: string }) {
  await runGit(['branch', '--move', options.from, options.to], { cwd: repo })
}

export async function setUpstream(repo: string, options: { branch: string; upstream: string }) {
  await runGit(['branch', `--set-upstream-to=${options.upstream}`, options.branch], { cwd: repo })
}

// --force-with-lease refuses when the remote moved since the last fetch, so nobody's work is overwritten blind.
// Pushes to the upstream by name, so a renamed local branch still updates the branch it tracks.
export async function forcePush(repo: string) {
  const upstream = (
    await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], {
      cwd: repo,
      okExitCodes: [128],
    })
  ).trim()
  const slash = upstream.indexOf('/')
  if (!upstream || slash < 0) throw new GitError('failed', null, '', 'this branch tracks nothing to force-push to')
  await runGit(
    ['push', '--force-with-lease', upstream.slice(0, slash), `HEAD:${upstream.slice(slash + 1)}`],
    network(repo),
  )
}

export async function deleteRemoteBranch(repo: string, options: { remote: string; branch: string }) {
  await runGit(['push', options.remote, '--delete', options.branch], network(repo))
}

// origin/feature becomes a local feature that tracks it.
export async function trackRemote(repo: string, ref: string) {
  await runGit(['switch', '--quiet', '--track', ref], { cwd: repo })
}

export async function createTag(repo: string, options: { name: string; sha: string; message: string }) {
  const args = options.message.trim()
    ? ['tag', '--annotate', options.name, '--message', options.message, options.sha]
    : ['tag', options.name, options.sha]
  await runGit(args, { cwd: repo })
}

export async function deleteTag(repo: string, name: string) {
  await runGit(['tag', '--delete', name], { cwd: repo })
}

export async function pushTags(repo: string, options: { remote: string; name: string | null }) {
  await runGit(['push', options.remote, options.name ? `refs/tags/${options.name}` : '--tags'], network(repo))
}

export interface Remote {
  name: string
  url: string
}

export async function listRemotes(repo: string): Promise<Remote[]> {
  const out = await runGit(['remote', '--verbose'], { cwd: repo })
  const seen = new Map<string, string>()
  for (const line of out.split('\n')) {
    const [name, url] = line.split(/\s+/)
    if (name && url && !seen.has(name)) seen.set(name, url)
  }
  return [...seen].map(([name, url]) => ({ name, url }))
}

export async function addRemote(repo: string, options: { name: string; url: string }) {
  await runGit(['remote', 'add', options.name, options.url], { cwd: repo })
}

export async function removeRemote(repo: string, name: string) {
  await runGit(['remote', 'remove', name], { cwd: repo })
}

export async function fetchRemote(repo: string, options: { remote: string; prune: boolean }) {
  await runGit(['fetch', ...(options.prune ? ['--prune'] : []), options.remote], network(repo))
}

export function rebaseOnto(repo: string, onto: string): Promise<{ conflicts: boolean }> {
  return mayConflict(repo, ['rebase', onto])
}

// Moves an unfinished operation on; a rebase may stop again on the next commit's conflicts.
export async function continueOperation(repo: string): Promise<{ conflicts: boolean }> {
  const operation = await readOperation(repo)
  if (!operation) throw new GitError('failed', null, '', 'nothing to continue')
  if (operation !== 'rebase') return mayConflict(repo, [operation, '--continue'])
  return mayConflict(repo, ['-c', 'core.editor=true', 'rebase', '--continue'])
}

export async function skipCommit(repo: string): Promise<{ conflicts: boolean }> {
  const operation = await readOperation(repo)
  if (operation !== 'rebase' && operation !== 'cherry-pick' && operation !== 'revert') {
    throw new GitError('failed', null, '', 'only a rebase, cherry-pick or revert can skip a commit')
  }
  return mayConflict(repo, [operation, '--skip'])
}

// Removes untracked files and folders, never ignored ones.
export async function cleanUntracked(repo: string) {
  await runGit(['clean', '--force', '-d', '--quiet'], { cwd: repo })
}

export async function stashStaged(repo: string, message: string) {
  await runGit(['stash', 'push', '--quiet', '--staged', ...(message ? ['-m', message] : [])], {
    cwd: repo,
    env: NO_EDITOR,
  })
}

export interface BlameLine {
  sha: string
  author: string
  time: number
  summary: string
}

// `--porcelain` repeats a commit's details only the first time it appears; later lines refer back by sha.
export async function blame(repo: string, path: string, ref?: string): Promise<BlameLine[]> {
  const out = await runGit(['blame', '--porcelain', ...(ref ? [ref] : []), '--', path], { cwd: repo })
  const commits = new Map<string, Omit<BlameLine, 'sha'>>()
  const lines: BlameLine[] = []
  let sha = ''
  let pending: Partial<Omit<BlameLine, 'sha'>> = {}
  for (const line of out.split('\n')) {
    const header = /^([0-9a-f]{40}) \d+ \d+/.exec(line)
    if (header) {
      sha = header[1] ?? ''
      pending = {}
    } else if (line.startsWith('author ')) pending.author = line.slice(7)
    else if (line.startsWith('author-time ')) pending.time = Number(line.slice(12))
    else if (line.startsWith('summary ')) pending.summary = line.slice(8)
    else if (line.startsWith('\t')) {
      if (!commits.has(sha)) {
        commits.set(sha, { author: pending.author ?? '', time: pending.time ?? 0, summary: pending.summary ?? '' })
      }
      lines.push({ sha, ...(commits.get(sha) as Omit<BlameLine, 'sha'>) })
    }
  }
  return lines
}
