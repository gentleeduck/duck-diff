import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import { runGit } from './run'
import { type DiffTarget, excludeArgs, headOrEmpty, pathArgs, readsWorkTree, targetArgs, unmergedPaths } from './target'

export type { ChangedFile, FileStatus }

const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '-M', '-z']
const ZERO_SHA = /^0+$/

const STATUS: Record<string, FileStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
  U: 'conflicted',
}

interface RawEntry {
  path: string
  oldPath: string | null
  status: FileStatus
  oldSha: string | null
  newSha: string | null
}

// `--raw -z`: ":oldmode newmode oldsha newsha STATUS\0path\0", plus a second path for R and C.
export function parseRaw(output: string): RawEntry[] {
  const parts = output.split('\0')
  const entries: RawEntry[] = []
  let i = 0
  while (i < parts.length) {
    const header = parts[i++]
    if (!header?.startsWith(':')) continue
    const [, , oldSha = '', newSha = '', code = ''] = header.slice(1).split(' ')
    const letter = code.charAt(0)
    const twoPaths = letter === 'R' || letter === 'C'
    const first = parts[i++] ?? ''
    const second = twoPaths ? (parts[i++] ?? '') : null
    entries.push({
      path: second ?? first,
      oldPath: twoPaths ? first : null,
      status: STATUS[letter] ?? 'modified',
      oldSha: ZERO_SHA.test(oldSha) ? null : oldSha,
      newSha: ZERO_SHA.test(newSha) ? null : newSha,
    })
  }
  return entries
}

interface NumstatEntry {
  path: string
  additions: number | null
  deletions: number | null
}

// `--numstat -z`: "add\tdel\tpath\0", or "add\tdel\t\0old\0new\0" for renames; binary counts are "-".
export function parseNumstat(output: string): NumstatEntry[] {
  const parts = output.split('\0')
  const entries: NumstatEntry[] = []
  let i = 0
  while (i < parts.length) {
    const record = parts[i++]
    if (!record) continue
    const [add = '', del = '', inlinePath = ''] = record.split('\t')
    let path = inlinePath
    if (path === '') {
      i++ // skip the old path
      path = parts[i++] ?? ''
    }
    entries.push({ path, additions: add === '-' ? null : Number(add), deletions: del === '-' ? null : Number(del) })
  }
  return entries
}

async function hashWorkTreeFiles(repo: string, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const out = await runGit(['hash-object', '--', ...paths], { cwd: repo })
  const shas = out.trim().split('\n')
  return new Map(paths.map((path, i) => [path, shas[i] ?? '']))
}

async function listUntracked(repo: string): Promise<ChangedFile[]> {
  const out = await runGit(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repo })
  const paths = out.split('\0').filter(Boolean)
  return Promise.all(
    paths.map(async (path): Promise<ChangedFile> => {
      const stat = await runGit(['diff', '--no-index', '--numstat', '-z', '--', '/dev/null', path], {
        cwd: repo,
        okExitCodes: [1],
      })
      const [entry] = parseNumstat(stat)
      const binary = entry !== undefined && entry.additions === null
      return {
        path,
        oldPath: null,
        status: 'untracked',
        additions: binary ? null : (entry?.additions ?? 0),
        deletions: binary ? null : (entry?.deletions ?? 0),
        binary,
        oldSha: null,
        newSha: null,
      }
    }),
  )
}

async function countAgainst(repo: string, base: string, path: string) {
  const [entry] = parseNumstat(await runGit(['diff', ...DIFF_FLAGS, '--numstat', base, '--', path], { cwd: repo }))
  return { additions: entry?.additions ?? 0, deletions: entry?.deletions ?? 0 }
}

// A conflicted file is shown as the working tree (markers included) against HEAD, once.
async function conflictedFiles(repo: string, paths: readonly string[]): Promise<ChangedFile[]> {
  const base = await headOrEmpty(repo)
  return Promise.all(
    paths.map(async (path) => ({
      path,
      oldPath: null,
      status: 'conflicted' as const,
      ...(await countAgainst(repo, base, path)),
      binary: false,
      oldSha: null,
      newSha: null,
    })),
  )
}

async function blobSizes(repo: string, shas: string[]): Promise<Map<string, number>> {
  if (shas.length === 0) return new Map()
  const out = await runGit(['cat-file', '--batch-check=%(objectname) %(objectsize)'], {
    cwd: repo,
    input: `${shas.join('\n')}\n`,
  })
  const sizes = new Map<string, number>()
  for (const line of out.split('\n')) {
    const [sha = '', size = ''] = line.split(' ')
    if (/^\d+$/.test(size)) sizes.set(sha, Number(size))
  }
  return sizes
}

// Only binary files show sizes, so only they pay for the lookups.
async function fillSizes(repo: string, target: DiffTarget, files: ChangedFile[]): Promise<void> {
  const binary = files.filter((file) => file.binary)
  if (binary.length === 0) return
  const worktree = readsWorkTree(target)
  const shas = binary.flatMap((file) => [file.oldSha, worktree ? null : file.newSha]).filter(Boolean) as string[]
  const sizes = await blobSizes(repo, shas)
  for (const file of binary) {
    file.oldSize = file.oldSha ? (sizes.get(file.oldSha) ?? null) : null
    if (file.status === 'deleted') file.newSize = null
    else if (worktree)
      file.newSize = await stat(join(repo, file.path)).then(
        (info) => info.size,
        () => null,
      )
    else file.newSize = file.newSha ? (sizes.get(file.newSha) ?? null) : null
  }
}

async function markGenerated(repo: string, files: ChangedFile[]): Promise<void> {
  if (files.length === 0) return
  const out = await runGit(['check-attr', '-z', '--stdin', 'linguist-generated'], {
    cwd: repo,
    input: `${files.map((file) => file.path).join('\0')}\0`,
  })
  const parts = out.split('\0')
  const generated = new Set<string>()
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const value = parts[i + 2]
    if (value === 'set' || value === 'true') generated.add(parts[i] ?? '')
  }
  for (const file of files) file.generated = generated.has(file.path)
}

export async function listFiles(repo: string, target: DiffTarget): Promise<ChangedFile[]> {
  const unmerged = await unmergedPaths(repo, target)
  const args = [...(await targetArgs(repo, target)), ...pathArgs(target), ...excludeArgs(target, unmerged)]
  const [raw, numstat] = await Promise.all([
    runGit(['diff', ...DIFF_FLAGS, '--raw', '--no-abbrev', ...args], { cwd: repo }),
    runGit(['diff', ...DIFF_FLAGS, '--numstat', ...args], { cwd: repo }),
  ])
  const counts = new Map(parseNumstat(numstat).map((entry) => [entry.path, entry]))
  const conflicted = new Set(unmerged)
  const files: ChangedFile[] = parseRaw(raw)
    .filter((entry) => !conflicted.has(entry.path))
    .map((entry) => {
      const count = counts.get(entry.path)
      const binary = count !== undefined && count.additions === null
      return {
        ...entry,
        additions: binary ? null : (count?.additions ?? 0),
        deletions: binary ? null : (count?.deletions ?? 0),
        binary,
      }
    })

  if (readsWorkTree(target)) {
    files.push(...(await conflictedFiles(repo, unmerged)), ...(await listUntracked(repo)))
    const present = files.filter((file) => file.status !== 'deleted').map((file) => file.path)
    const shas = await hashWorkTreeFiles(repo, present)
    for (const file of files) file.newSha = shas.get(file.path) ?? file.newSha
  }

  await Promise.all([fillSizes(repo, target, files), markGenerated(repo, files)])
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
