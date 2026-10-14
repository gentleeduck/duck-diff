import { runGit } from './run'

export type DiffTarget =
  | { kind: 'unstaged' }
  | { kind: 'staged' }
  | { kind: 'local' }
  | { kind: 'range'; from: string; to: string; mode: 'two-dot' | 'merge-base' }
  | { kind: 'commit'; sha: string }

// The empty tree is what a root commit is compared against; its sha is fixed by git.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export async function targetArgs(repo: string, target: DiffTarget): Promise<string[]> {
  switch (target.kind) {
    case 'unstaged':
      return []
    case 'staged':
      return ['--cached']
    case 'local':
      return ['HEAD']
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
