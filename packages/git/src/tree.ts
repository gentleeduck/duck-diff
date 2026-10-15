import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit, runGitBytes } from './run'

// `null` means the working tree: tracked files plus untracked ones git does not ignore.
export type TreeRef = string | null

export async function listTree(repo: string, ref: TreeRef): Promise<string[]> {
  const out =
    ref === null
      ? await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo })
      : await runGit(['ls-tree', '-r', '-z', '--name-only', ref, '--'], { cwd: repo })
  return [...new Set(out.split('\0').filter(Boolean))].sort()
}

export interface FileContents {
  // Null when the file is binary or larger than the viewer will show.
  text: string | null
  size: number
  binary: boolean
}

const MAX_BYTES = 4 * 1024 * 1024

// A file's bytes at a ref or in the working tree; null when it is missing, not a file, or over the limit.
export async function readTreeBytes(
  repo: string,
  ref: TreeRef,
  path: string,
): Promise<{ bytes: Buffer | null; size: number } | null> {
  if (ref === null) {
    const info = await stat(join(repo, path)).catch(() => null)
    if (!info?.isFile()) return null
    return { size: info.size, bytes: info.size > MAX_BYTES ? null : await readFile(join(repo, path)) }
  }
  const spec = `${ref}:${path}`
  const type = await runGit(['cat-file', '-t', spec], { cwd: repo, okExitCodes: [128] })
  if (type.trim() !== 'blob') return null
  const size = Number((await runGit(['cat-file', '-s', spec], { cwd: repo })).trim())
  return { size, bytes: size > MAX_BYTES ? null : await runGitBytes(['cat-file', 'blob', spec], { cwd: repo }) }
}

export async function readTreeFile(repo: string, ref: TreeRef, path: string): Promise<FileContents | null> {
  const read = await readTreeBytes(repo, ref, path)
  if (!read) return null
  const { bytes, size } = read
  if (!bytes) return { text: null, size, binary: false }
  // git's rule for binary: a NUL byte in the first 8000 bytes.
  const binary = bytes.subarray(0, 8000).includes(0)
  return { text: binary ? null : bytes.toString('utf8'), size, binary }
}
