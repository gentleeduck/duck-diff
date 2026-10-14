import type { ChangedFile } from './files'
import { type RunOptions, runGit, streamGit } from './run'
import { type DiffTarget, readsWorkTree, targetArgs } from './target'

type PatchFile = Pick<ChangedFile, 'path' | 'oldPath' | 'status'>

const PATCH_FLAGS = ['--no-color', '--no-ext-diff', '-M', '--patch']

// Untracked files are not in any tree, so they are diffed against /dev/null; exit code 1 means "differs".
async function patchCommand(repo: string, target: DiffTarget, file: PatchFile): Promise<[string[], RunOptions]> {
  if (file.status === 'untracked') {
    return [
      ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', file.path],
      { cwd: repo, okExitCodes: [1] },
    ]
  }
  const paths = file.oldPath ? [file.oldPath, file.path] : [file.path]
  return [['diff', ...PATCH_FLAGS, ...(await targetArgs(repo, target)), '--', ...paths], { cwd: repo }]
}

export async function getPatch(repo: string, target: DiffTarget, file: PatchFile): Promise<string> {
  const [args, options] = await patchCommand(repo, target, file)
  return runGit(args, options)
}

export async function* streamPatch(repo: string, target: DiffTarget, file: PatchFile): AsyncIterable<string> {
  const [args, options] = await patchCommand(repo, target, file)
  yield* streamGit(args, options)
}

export async function* streamDiff(repo: string, target: DiffTarget): AsyncIterable<string> {
  yield* streamGit(['diff', ...PATCH_FLAGS, ...(await targetArgs(repo, target))], { cwd: repo })
  if (!readsWorkTree(target)) return
  const untracked = await runGit(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repo })
  for (const path of untracked.split('\0').filter(Boolean)) {
    yield* streamGit(['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', path], {
      cwd: repo,
      okExitCodes: [1],
    })
  }
}
