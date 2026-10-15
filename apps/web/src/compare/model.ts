import type { DiffTarget } from '@duck-diff/protocol'

export type Endpoint = { kind: 'worktree' } | { kind: 'index' } | { kind: 'ref'; name: string }

export interface TargetDescription {
  from: string
  to: string
  path: string | null
}

const WORKTREE = 'working tree'
const INDEX = 'staged'

// Full commit hashes (from history picks) read better at the length git prints them, and fetched
// pull request heads by their number.
function short(ref: string): string {
  const pull = /^refs\/duck-diff\/pr\/(\d+)$/.exec(ref)
  if (pull) return `PR #${pull[1]}`
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref
}

export function describeTarget(target: DiffTarget): TargetDescription {
  const path = target.kind === 'range' || target.kind === 'commit' ? (target.path ?? null) : null
  switch (target.kind) {
    case 'local':
      return { from: 'HEAD', to: WORKTREE, path }
    case 'staged':
      return { from: 'HEAD', to: INDEX, path }
    case 'unstaged':
      return { from: INDEX, to: WORKTREE, path }
    case 'range':
      return { from: short(target.from), to: short(target.to), path }
    case 'commit': {
      const short = target.sha.slice(0, 7)
      return { from: `${short}^`, to: short, path }
    }
  }
}

function endpoints(target: DiffTarget): [Endpoint, Endpoint] {
  const head: Endpoint = { kind: 'ref', name: 'HEAD' }
  switch (target.kind) {
    case 'local':
      return [head, { kind: 'worktree' }]
    case 'staged':
      return [head, { kind: 'index' }]
    case 'unstaged':
      return [{ kind: 'index' }, { kind: 'worktree' }]
    case 'range':
      return [
        { kind: 'ref', name: target.from },
        { kind: 'ref', name: target.to },
      ]
    case 'commit':
      return [
        { kind: 'ref', name: `${target.sha}^` },
        { kind: 'ref', name: target.sha },
      ]
  }
}

// git can only compare the index or the working tree against HEAD (or the working tree against the index),
// so choosing one of them pins the other side to whatever makes a valid comparison.
export function withSide(target: DiffTarget, side: 'from' | 'to', endpoint: Endpoint): DiffTarget {
  const [from, to] = endpoints(target)
  const nextFrom = side === 'from' ? endpoint : from
  const nextTo = side === 'to' ? endpoint : to
  if (nextTo.kind === 'worktree') return nextFrom.kind === 'index' ? { kind: 'unstaged' } : { kind: 'local' }
  if (nextTo.kind === 'index') return { kind: 'staged' }
  if (nextFrom.kind !== 'ref') return { kind: 'local' }
  const mode = target.kind === 'range' ? target.mode : 'merge-base'
  const path = describeTarget(target).path
  return { kind: 'range', from: nextFrom.name, to: nextTo.name, mode, ...(path ? { path } : {}) }
}

export function withoutPath(target: DiffTarget): DiffTarget {
  if (target.kind !== 'range' && target.kind !== 'commit') return target
  const { path: _path, ...rest } = target
  return rest
}

// `order` is the file's log, newest first, so the commit further down is the older version.
export function historyTarget(path: string, order: readonly string[], sha: string, other?: string): DiffTarget {
  if (!other || other === sha) return { kind: 'commit', sha, path }
  const [to, from] = order.indexOf(sha) < order.indexOf(other) ? [sha, other] : [other, sha]
  return { kind: 'range', from, to, mode: 'two-dot', path }
}

export interface Preset {
  label: string
  target: DiffTarget
}

const DEFAULT_BRANCHES = ['main', 'master', 'trunk']

export function presets(branches: readonly string[]): Preset[] {
  const list: Preset[] = [
    { label: 'Local changes', target: { kind: 'local' } },
    { label: 'Staged', target: { kind: 'staged' } },
    { label: 'Unstaged', target: { kind: 'unstaged' } },
  ]
  const base = DEFAULT_BRANCHES.find((name) => branches.includes(name))
  if (base) {
    list.push({
      label: `This branch against ${base}`,
      target: { kind: 'range', from: base, to: 'HEAD', mode: 'merge-base' },
    })
  }
  return list
}
