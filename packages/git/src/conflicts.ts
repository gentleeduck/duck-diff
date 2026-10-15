import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GitError } from './errors'
import { runGit } from './run'

export type ConflictSegment =
  | { kind: 'common'; lines: string[] }
  | {
      kind: 'conflict'
      ours: string[]
      // Only diff3 and zdiff3 styles write the base between the sides.
      base: string[] | null
      theirs: string[]
      oursLabel: string
      baseLabel: string | null
      theirsLabel: string
    }

export interface ParsedConflicts {
  eol: '\n' | '\r\n'
  finalNewline: boolean
  segments: ConflictSegment[]
}

export interface ConflictFile extends ParsedConflicts {
  path: string
  // The file as each side had it; null where that side has no such file (added on one side only).
  stages: { base: string | null; ours: string | null; theirs: string | null }
}

type Marker = 'start' | 'base' | 'separator' | 'end'

// A marker is exactly `size` characters followed by a space or the end of the line, as git writes them.
function markerOf(line: string, size: number): { kind: Marker; label: string } | null {
  const char = line[0]
  const kinds: Record<string, Marker> = { '<': 'start', '|': 'base', '=': 'separator', '>': 'end' }
  const kind = char ? kinds[char] : undefined
  if (!kind || line.length < size) return null
  for (let i = 1; i < size; i++) if (line[i] !== char) return null
  const rest = line.slice(size)
  if (rest !== '' && rest[0] !== ' ') return null
  if (kind === 'separator' && rest.trim() !== '') return null
  return { kind, label: rest.slice(1) }
}

export function parseConflicts(text: string, markerSize = 7): ParsedConflicts {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const finalNewline = text.endsWith('\n')
  const lines = text.split(/\r?\n/)
  if (finalNewline) lines.pop()
  const segments: ConflictSegment[] = []
  const common = (line: string) => {
    const last = segments.at(-1)
    if (last?.kind === 'common') last.lines.push(line)
    else segments.push({ kind: 'common', lines: [line] })
  }

  let block: Extract<ConflictSegment, { kind: 'conflict' }> | null = null
  let section: 'ours' | 'base' | 'theirs' = 'ours'
  let raw: string[] = []
  // A conflict inside a side (from a recursive merge base) is content, matched marker for marker.
  let depth = 0
  for (const line of lines) {
    const marker = markerOf(line, markerSize)
    if (!block) {
      if (marker?.kind === 'start') {
        block = {
          kind: 'conflict',
          ours: [],
          base: null,
          theirs: [],
          oursLabel: marker.label,
          baseLabel: null,
          theirsLabel: '',
        }
        section = 'ours'
        raw = [line]
        depth = 0
      } else common(line)
      continue
    }
    raw.push(line)
    if (marker && depth > 0) {
      if (marker.kind === 'start') depth++
      if (marker.kind === 'end') depth--
    } else if (marker?.kind === 'start') {
      depth++
    } else if (marker?.kind === 'base' && section === 'ours') {
      section = 'base'
      block.base = []
      block.baseLabel = marker.label
      continue
    } else if (marker?.kind === 'separator' && section !== 'theirs') {
      section = 'theirs'
      continue
    } else if (marker?.kind === 'end' && section === 'theirs') {
      block.theirsLabel = marker.label
      segments.push(block)
      block = null
      continue
    }
    const target = section === 'base' ? block.base : block[section]
    target?.push(line)
  }
  // Markers that never close are not a conflict git wrote; keep them as text.
  if (block) for (const line of raw) common(line)
  return { eol, finalNewline, segments }
}

export function hasConflictMarkers(text: string, markerSize = 7): boolean {
  return parseConflicts(text, markerSize).segments.some((segment) => segment.kind === 'conflict')
}

async function markerSize(repo: string, path: string): Promise<number> {
  const out = await runGit(['check-attr', 'conflict-marker-size', '--', path], { cwd: repo })
  const value = Number(out.trim().split(': ').at(-1))
  return Number.isInteger(value) && value > 0 ? value : 7
}

async function stage(repo: string, n: 1 | 2 | 3, path: string): Promise<string | null> {
  const listed = await runGit(['ls-files', '--stage', '--', path], { cwd: repo })
  if (!listed.split('\n').some((line) => line.split('\t')[0]?.endsWith(` ${n}`))) return null
  return runGit(['show', `:${n}:${path}`], { cwd: repo })
}

async function isConflicted(repo: string, path: string): Promise<boolean> {
  return (await runGit(['ls-files', '--unmerged', '--', path], { cwd: repo })).trim() !== ''
}

export async function readConflict(repo: string, path: string): Promise<ConflictFile> {
  if (!(await isConflicted(repo, path))) throw new GitError('failed', null, '', `${path} is not conflicted`)
  const [text, size, base, ours, theirs] = await Promise.all([
    readFile(join(repo, path), 'utf8').catch(() => ''),
    markerSize(repo, path),
    stage(repo, 1, path),
    stage(repo, 2, path),
    stage(repo, 3, path),
  ])
  return { path, ...parseConflicts(text, size), stages: { base, ours, theirs } }
}

// The merged text replaces the working file and is staged, which is what marks the conflict resolved.
export async function writeResolution(repo: string, path: string, text: string): Promise<void> {
  if (!(await isConflicted(repo, path))) throw new GitError('failed', null, '', `${path} is not conflicted`)
  await writeFile(join(repo, path), text)
  await runGit(['add', '--', path], { cwd: repo })
}
