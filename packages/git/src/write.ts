import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChangedFile } from '@duck-diff/protocol'
import { GitError } from './errors'
import { listFiles } from './files'
import { getPatch } from './patch'
import { runGit } from './run'

type WriteFile = Pick<ChangedFile, 'path' | 'oldPath' | 'status' | 'newSha'>

export function splitPatch(patch: string): { header: string; hunks: string[] } {
  const start = patch.search(/^@@ /m)
  if (start === -1) return { header: patch, hunks: [] }
  const header = patch.slice(0, start)
  const hunks = patch
    .slice(start)
    .split(/^(?=@@ )/m)
    .filter(Boolean)
  return { header, hunks }
}

function stale(message: string): never {
  throw new GitError('stale', null, '', message)
}

// The page names a hunk by index and header; both must still match git's current output, or nothing is written.
async function hunkPatch(repo: string, kind: 'unstaged' | 'staged', file: WriteFile, index: number, header: string) {
  if (file.status === 'untracked') {
    throw new GitError('failed', null, '', 'untracked files are staged or discarded as a whole')
  }
  const { header: fileHeader, hunks } = splitPatch(await getPatch(repo, { kind }, file))
  const hunk = hunks[index]
  if (!hunk || hunk.slice(0, hunk.indexOf('\n')) !== header) stale(`hunk ${index} of ${file.path} changed`)
  return fileHeader + hunk
}

async function apply(repo: string, patch: string, flags: string[]) {
  await runGit(['apply', ...flags, '--whitespace=nowarn', '-'], { cwd: repo, input: patch })
}

export async function stageHunk(repo: string, file: WriteFile, index: number, header: string) {
  await apply(repo, await hunkPatch(repo, 'unstaged', file, index, header), ['--cached'])
}

export async function unstageHunk(repo: string, file: WriteFile, index: number, header: string) {
  await apply(repo, await hunkPatch(repo, 'staged', file, index, header), ['--cached', '--reverse'])
}

export async function discardHunk(repo: string, file: WriteFile, index: number, header: string) {
  await apply(repo, await hunkPatch(repo, 'unstaged', file, index, header), ['--reverse'])
}

async function current(repo: string, kind: 'unstaged' | 'staged', file: WriteFile): Promise<ChangedFile> {
  const found = (await listFiles(repo, { kind })).find((entry) => entry.path === file.path)
  if (!found || found.newSha !== file.newSha) stale(`${file.path} changed since it was shown`)
  return found
}

function paths(file: WriteFile): string[] {
  return file.oldPath ? [file.oldPath, file.path] : [file.path]
}

export async function stageFile(repo: string, file: WriteFile) {
  await current(repo, 'unstaged', file)
  await runGit(['add', '-A', '--', ...paths(file)], { cwd: repo })
}

export async function unstageFile(repo: string, file: WriteFile) {
  await current(repo, 'staged', file)
  await runGit(['restore', '--staged', '--', ...paths(file)], { cwd: repo })
}

export async function discardFile(repo: string, file: WriteFile) {
  const found = await current(repo, 'unstaged', file)
  if (found.status === 'untracked') {
    await rm(join(repo, found.path), { force: true })
    return
  }
  await runGit(['restore', '--', found.path], { cwd: repo })
}
