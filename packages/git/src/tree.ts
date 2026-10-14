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

export async function readTreeFile(repo: string, ref: TreeRef, path: string): Promise<FileContents | null> {
  let bytes: Buffer
  let size: number
  if (ref === null) {
    const info = await stat(join(repo, path)).catch(() => null)
    if (!info?.isFile()) return null
    size = info.size
    if (size > MAX_BYTES) return { text: null, size, binary: false }
    bytes = await readFile(join(repo, path))
  } else {
    const spec = `${ref}:${path}`
    const type = await runGit(['cat-file', '-t', spec], { cwd: repo, okExitCodes: [128] })
    if (type.trim() !== 'blob') return null
    size = Number((await runGit(['cat-file', '-s', spec], { cwd: repo })).trim())
    if (size > MAX_BYTES) return { text: null, size, binary: false }
    bytes = await runGitBytes(['cat-file', 'blob', spec], { cwd: repo })
  }
  // git's rule for binary: a NUL byte in the first 8000 bytes.
  const binary = bytes.subarray(0, 8000).includes(0)
  return { text: binary ? null : bytes.toString('utf8'), size, binary }
}
