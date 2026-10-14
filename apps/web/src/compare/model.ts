import type { DiffTarget } from '@duck-diff/protocol'

export type Endpoint = { kind: 'worktree' } | { kind: 'index' } | { kind: 'ref'; name: string }

export interface TargetDescription {
  from: string
  to: string
  operator: '..' | '...' | null
}

const WORKTREE = 'working tree'
const INDEX = 'staged'

export function describeTarget(target: DiffTarget): TargetDescription {
  switch (target.kind) {
    case 'local':
      return { from: 'HEAD', to: WORKTREE, operator: null }
    case 'staged':
      return { from: 'HEAD', to: INDEX, operator: null }
    case 'unstaged':
      return { from: INDEX, to: WORKTREE, operator: null }
    case 'range':
      return { from: target.from, to: target.to, operator: target.mode === 'two-dot' ? '..' : '...' }
    case 'commit': {
      const short = target.sha.slice(0, 7)
      return { from: `${short}^`, to: short, operator: null }
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
  return { kind: 'range', from: nextFrom.name, to: nextTo.name, mode }
}

export function toggleOperator(target: DiffTarget): DiffTarget {
  if (target.kind !== 'range') return target
  return { ...target, mode: target.mode === 'two-dot' ? 'merge-base' : 'two-dot' }
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
