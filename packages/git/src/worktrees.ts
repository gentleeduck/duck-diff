import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { GitError } from './errors'
import { runGit } from './run'

export interface Worktree {
  path: string
  head: string | null
  // null when detached.
  branch: string | null
  main: boolean
  // The worktree this server reads.
  current: boolean
  locked: boolean
  prunable: boolean
}

const real = (path: string) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export async function listWorktrees(repo: string): Promise<Worktree[]> {
  const out = await runGit(['worktree', 'list', '--porcelain'], { cwd: repo })
  const here = real((await runGit(['rev-parse', '--show-toplevel'], { cwd: repo })).trim())
  const trees: Worktree[] = []
  for (const block of out.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean)
    const path = lines.find((line) => line.startsWith('worktree '))?.slice(9)
    if (!path) continue
    const field = (name: string) => lines.find((line) => line === name || line.startsWith(`${name} `))
    trees.push({
      path,
      head: field('HEAD')?.slice(5) ?? null,
      branch:
        field('branch')
          ?.slice(7)
          .replace(/^refs\/heads\//, '') ?? null,
      main: trees.length === 0,
      current: real(path) === here,
      locked: Boolean(field('locked')),
      prunable: Boolean(field('prunable')),
    })
  }
  return trees
}

export async function addWorktree(
  repo: string,
  options: { path: string; branch: string; create: boolean; start?: string },
): Promise<void> {
  const args = options.create
    ? ['worktree', 'add', '-b', options.branch, '--', options.path, ...(options.start ? [options.start] : [])]
    : ['worktree', 'add', '--', options.path, options.branch]
  await runGit(args, { cwd: repo })
}

export async function removeWorktree(repo: string, options: { path: string; force: boolean }): Promise<void> {
  const tree = (await listWorktrees(repo)).find((each) => real(each.path) === real(options.path))
  if (!tree) throw new GitError('failed', null, '', `${options.path} is not a worktree of this repository`)
  if (tree.main) throw new GitError('failed', null, '', 'the main worktree cannot be removed')
  await runGit(['worktree', 'remove', ...(options.force ? ['--force'] : []), '--', tree.path], { cwd: repo })
}

export async function pruneWorktrees(repo: string): Promise<void> {
  await runGit(['worktree', 'prune'], { cwd: repo })
}

export interface Submodule {
  path: string
  // The commit the superproject records, and the one checked out (null before init).
  recorded: string
  current: string | null
  initialized: boolean
  url: string | null
}

async function submoduleUrls(repo: string): Promise<Map<string, string>> {
  if (!existsSync(join(repo, '.gitmodules'))) return new Map()
  const out = await runGit(['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.(path|url)$'], {
    cwd: repo,
    okExitCodes: [1],
  })
  const paths = new Map<string, string>()
  const urls = new Map<string, string>()
  for (const line of out.split('\n')) {
    const match = /^submodule\.(.+)\.(path|url) (.*)$/.exec(line)
    if (!match) continue
    const [, name = '', key, value = ''] = match
    ;(key === 'path' ? paths : urls).set(name, value)
  }
  return new Map([...paths].map(([name, path]) => [path, urls.get(name) ?? '']))
}

export async function submoduleHead(repo: string, path: string): Promise<string | null> {
  const dir = join(repo, path)
  if (!existsSync(join(dir, '.git'))) return null
  const out = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: dir, okExitCodes: [1] })
  return out.trim() || null
}

export async function listSubmodules(repo: string): Promise<Submodule[]> {
  const [staged, urls] = await Promise.all([runGit(['ls-files', '--stage', '-z'], { cwd: repo }), submoduleUrls(repo)])
  const found: Submodule[] = []
  for (const record of staged.split('\0')) {
    const match = /^160000 ([0-9a-f]+) 0\t(.*)$/.exec(record)
    if (!match) continue
    const [, recorded = '', path = ''] = match
    const current = await submoduleHead(repo, path)
    found.push({ path, recorded, current, initialized: current !== null, url: urls.get(path) ?? null })
  }
  return found
}

export interface SubmoduleCommit {
  sha: string
  subject: string
  author: string
  time: number
}

// The commits a pointer move brings in, newest first, read inside the submodule's own checkout.
export async function submoduleLog(
  repo: string,
  path: string,
  from: string | null,
  to: string,
): Promise<SubmoduleCommit[]> {
  const dir = join(repo, path)
  if (!existsSync(join(dir, '.git'))) return []
  const range = from ? [`${from}..${to}`] : [to]
  const out = await runGit(['log', '--max-count=200', '--format=%H%x1f%s%x1f%an%x1f%at', ...range, '--'], { cwd: dir })
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', subject = '', author = '', time = '0'] = line.split('\x1f')
      return { sha, subject, author, time: Number(time) }
    })
}

export async function updateSubmodules(repo: string, options: { path?: string; init: boolean }): Promise<void> {
  const args = ['submodule', 'update', '--recursive', ...(options.init ? ['--init'] : [])]
  await runGit([...args, '--', ...(options.path ? [options.path] : [])], { cwd: repo, timeoutMs: 300_000 })
}

export async function syncSubmodules(repo: string): Promise<void> {
  await runGit(['submodule', 'sync', '--recursive'], { cwd: repo })
}
