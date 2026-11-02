import { runGit } from '@duck-diff/git'
import { type DiffTarget, targetKey } from '@duck-diff/protocol'

// The branch HEAD is on (also before its first commit), or the commit it is detached at.
export interface Head {
  branch: string | null
  sha: string | null
}

export async function readHead(repo: string): Promise<Head> {
  const ref = (await runGit(['symbolic-ref', '-q', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  if (ref.startsWith('refs/heads/')) return { branch: ref.slice('refs/heads/'.length), sha: null }
  const sha = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  return { branch: null, sha: sha || null }
}

// Local branches, with HEAD's own counted even before its first commit gives it a ref.
export async function existingBranches(repo: string, head: Head): Promise<Set<string>> {
  const out = await runGit(['for-each-ref', '--format=%(refname)', 'refs/heads/'], { cwd: repo })
  const names = new Set(out.split('\n').flatMap((ref) => (ref ? [ref.slice('refs/heads/'.length)] : [])))
  if (head.branch) names.add(head.branch)
  return names
}

export interface Scope {
  target: DiffTarget
  on?: string
  branches: string[]
}

const HEAD_AT = /^(?:HEAD|@)(?=$|[~^])/
// feat~2 and feat^ are about feat.
const branchOf = (ref: string) => ref.replace(/[~^].*$/, '')

// What a comparison names once HEAD is read as where it is now: ranges and bases take the branch name (the commit
// when detached), a commit becomes its full sha, and the working tree and index carry the branch they sit on.
export async function scopeOf(repo: string, target: DiffTarget, head: Head, branches: Set<string>): Promise<Scope> {
  const here = head.branch ?? head.sha
  const pin = (ref: string) => (here ? ref.replace(HEAD_AT, here) : ref)
  switch (target.kind) {
    case 'unstaged':
    case 'staged':
    case 'local': {
      const pinned = 'base' in target && target.base ? { ...target, base: pin(target.base) } : target
      return { target: pinned, on: here ?? undefined, branches: head.branch ? [head.branch] : [] }
    }
    case 'range': {
      const to = pin(target.to)
      const owner = branchOf(to)
      return { target: { ...target, from: pin(target.from), to }, branches: branches.has(owner) ? [owner] : [] }
    }
    case 'commit': {
      const sha = (
        await runGit(['rev-parse', '--verify', '--quiet', `${target.sha}^{commit}`], { cwd: repo, okExitCodes: [1] })
      ).trim()
      return { target: { ...target, sha: sha || target.sha }, branches: [] }
    }
  }
}

export const scopeKey = (scope: { target: DiffTarget; on?: string }) =>
  scope.on ? `${targetKey(scope.target)} on ${scope.on}` : targetKey(scope.target)

// The same comparison after a branch is renamed: every place it named the old name now names the new one.
export function renamed<T extends Scope>(scope: T, from: string, to: string): T {
  const swap = (ref: string) => (branchOf(ref) === from ? to + ref.slice(from.length) : ref)
  const target = scope.target
  const next: DiffTarget =
    target.kind === 'range'
      ? { ...target, from: swap(target.from), to: swap(target.to) }
      : 'base' in target && target.base
        ? { ...target, base: swap(target.base) }
        : target
  return {
    ...scope,
    target: next,
    ...(scope.on === from ? { on: to } : {}),
    branches: scope.branches.map((name) => (name === from ? to : name)),
  }
}
