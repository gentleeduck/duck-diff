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
  return ref.replace(/^[0-9a-f]{40}(?=[\^~]|$)/, (sha) => sha.slice(0, 7))
}

export function describeTarget(target: DiffTarget): TargetDescription {
  const path = target.kind === 'range' || target.kind === 'commit' ? (target.path ?? null) : null
  switch (target.kind) {
    case 'local':
      return { from: short(target.base ?? 'HEAD'), to: WORKTREE, path }
    case 'staged':
      return { from: short(target.base ?? 'HEAD'), to: INDEX, path }
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
  switch (target.kind) {
    case 'local':
      return [{ kind: 'ref', name: target.base ?? 'HEAD' }, { kind: 'worktree' }]
    case 'staged':
      return [{ kind: 'ref', name: target.base ?? 'HEAD' }, { kind: 'index' }]
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

// The text each picker opens with, to edit in place: the ref (a full hash cut to git's short length), or nothing
// for the working tree and the index, which are no ref.
export function sideText(target: DiffTarget): { from: string; to: string } {
  const text = (end: Endpoint) =>
    end.kind === 'ref' ? end.name.replace(/^[0-9a-f]{40}(?=[\^~]|$)/, (sha) => sha.slice(0, 7)) : ''
  const [from, to] = endpoints(target)
  return { from: text(from), to: text(to) }
}

// A branch or tag name, as opposed to a commit: a sha, or HEAD and anything counted back from it.
const named = (ref: string) => !/^[0-9a-f]{7,40}$/.test(ref) && !/^HEAD\b/.test(ref) && !/[~^]/.test(ref)

// The working tree and the index compare with any commit, and the working tree with the index.
// Two refs compare as they are, except two branch or tag names, which compare from where they split as GitHub
// does: done between a commit and its own ancestor, that would show nothing.
export function withSide(target: DiffTarget, side: 'from' | 'to', endpoint: Endpoint): DiffTarget {
  const [from, to] = endpoints(target)
  const nextFrom = side === 'from' ? endpoint : from
  const nextTo = side === 'to' ? endpoint : to
  const base = nextFrom.kind === 'ref' && nextFrom.name !== 'HEAD' ? { base: nextFrom.name } : {}
  if (nextTo.kind === 'worktree') return nextFrom.kind === 'index' ? { kind: 'unstaged' } : { kind: 'local', ...base }
  if (nextTo.kind === 'index') return { kind: 'staged', ...base }
  if (nextFrom.kind !== 'ref') return { kind: 'local' }
  const mode =
    named(nextFrom.name) && named(nextTo.name) ? (target.kind === 'range' ? target.mode : 'merge-base') : 'two-dot'
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
