import type { ChangedFile, FileStatus } from '@duck-diff/protocol'
import { runGit } from './run'
import { type DiffTarget, pathArgs, readsWorkTree, targetArgs } from './target'

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

export async function listFiles(repo: string, target: DiffTarget): Promise<ChangedFile[]> {
  const args = [...(await targetArgs(repo, target)), ...pathArgs(target)]
  const [raw, numstat] = await Promise.all([
    runGit(['diff', ...DIFF_FLAGS, '--raw', '--no-abbrev', ...args], { cwd: repo }),
    runGit(['diff', ...DIFF_FLAGS, '--numstat', ...args], { cwd: repo }),
  ])
  const counts = new Map(parseNumstat(numstat).map((entry) => [entry.path, entry]))
  const files: ChangedFile[] = parseRaw(raw).map((entry) => {
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
    files.push(...(await listUntracked(repo)))
    const present = files.filter((file) => file.status !== 'deleted').map((file) => file.path)
    const shas = await hashWorkTreeFiles(repo, present)
    for (const file of files) file.newSha = shas.get(file.path) ?? file.newSha
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}
