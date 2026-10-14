import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DiffTarget } from '@duck-diff/protocol'
import { runGit } from './run'

export type Side = 'old' | 'new'

type Source = { from: 'tree'; rev: string } | { from: 'index' } | { from: 'worktree' } | null

async function sideSource(repo: string, target: DiffTarget, side: Side): Promise<Source> {
  const tree = (rev: string): Source => ({ from: 'tree', rev })
  switch (target.kind) {
    case 'unstaged':
      return side === 'old' ? { from: 'index' } : { from: 'worktree' }
    case 'staged':
      return side === 'old' ? tree('HEAD') : { from: 'index' }
    case 'local':
      return side === 'old' ? tree('HEAD') : { from: 'worktree' }
    case 'range':
      if (side === 'new') return tree(target.to)
      if (target.mode === 'two-dot') return tree(target.from)
      return tree((await runGit(['merge-base', target.from, target.to], { cwd: repo })).trim())
    case 'commit': {
      if (side === 'new') return tree(target.sha)
      // A root commit has no parent, so its old side is empty.
      const parent = await runGit(['rev-parse', '--verify', '--quiet', `${target.sha}^1`], {
        cwd: repo,
        okExitCodes: [1],
      })
      return parent.trim() ? tree(parent.trim()) : null
    }
  }
}

export async function readSide(repo: string, target: DiffTarget, side: Side, path: string): Promise<string | null> {
  const source = await sideSource(repo, target, side)
  if (source === null) return null
  if (source.from === 'worktree') return readFile(join(repo, path), 'utf8').catch(() => null)
  const spec = source.from === 'index' ? `:${path}` : `${source.rev}:${path}`
  const type = await runGit(['cat-file', '-t', spec], { cwd: repo, okExitCodes: [128] })
  if (type.trim() !== 'blob') return null
  return runGit(['cat-file', 'blob', spec], { cwd: repo })
}
