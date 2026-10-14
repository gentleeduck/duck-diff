import type { DiffTarget } from '@duck-diff/protocol'
import { runGit } from './run'

export type { DiffTarget }

// The empty tree is what a root commit is compared against; its sha is fixed by git.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// Before the first commit there is no HEAD, so the working tree is compared against nothing.
export async function headOrEmpty(repo: string): Promise<string> {
  const head = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })
  return head.trim() ? 'HEAD' : EMPTY_TREE
}

export async function targetArgs(repo: string, target: DiffTarget): Promise<string[]> {
  switch (target.kind) {
    case 'unstaged':
      return []
    case 'staged':
      return ['--cached']
    case 'local':
      return [await headOrEmpty(repo)]
    case 'range':
      return target.mode === 'merge-base' ? [`${target.from}...${target.to}`] : [target.from, target.to]
    case 'commit': {
      const parent = await runGit(['rev-parse', '--verify', '--quiet', `${target.sha}^1`], {
        cwd: repo,
        okExitCodes: [1],
      })
      return [parent.trim() ? `${target.sha}^1` : EMPTY_TREE, target.sha]
    }
  }
}

// Targets whose new side is the working tree, so blob shas must be computed from the files.
export function readsWorkTree(target: DiffTarget): boolean {
  return target.kind === 'unstaged' || target.kind === 'local'
}

// A target limited to one file passes it after `--` so git reports nothing else.
export function pathArgs(target: DiffTarget): string[] {
  return (target.kind === 'range' || target.kind === 'commit') && target.path ? ['--', target.path] : []
}

// Paths stuck in a merge conflict; only targets that read the index or working tree can have them.
export async function unmergedPaths(repo: string, target: DiffTarget): Promise<string[]> {
  if (target.kind !== 'unstaged' && target.kind !== 'staged' && target.kind !== 'local') return []
  // The index alone knows which paths are unmerged, so this avoids a full working-tree diff.
  const out = await runGit(['ls-files', '-u', '-z'], { cwd: repo })
  const paths = out
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(entry.indexOf('\t') + 1))
  return [...new Set(paths)]
}

// The index cannot show a conflicted path as a normal patch, so index-side targets leave it out.
export function excludeArgs(target: DiffTarget, unmerged: readonly string[]): string[] {
  if (unmerged.length === 0 || (target.kind !== 'unstaged' && target.kind !== 'staged')) return []
  return ['--', '.', ...unmerged.map((path) => `:(exclude,literal)${path}`)]
}
