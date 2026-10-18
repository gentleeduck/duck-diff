import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitError } from './errors'
import { runGit } from './run'
import { incomingRef, readIncoming, readOperation } from './sync'

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

// One side of the operation as a commit: what to call it, its short hash and its subject.
export interface ConflictSide {
  name: string
  sha: string
  subject: string
}

export interface ConflictFile extends ParsedConflicts {
  path: string
  // The file as each side had it; null where that side has no such file (added on one side only).
  stages: { base: string | null; ours: string | null; theirs: string | null }
  // The commits behind ours (HEAD), theirs (what the operation brings in) and their merge base.
  sides: { ours: ConflictSide | null; theirs: ConflictSide | null; base: ConflictSide | null }
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

async function commitOf(repo: string, ref: string, name: string): Promise<ConflictSide | null> {
  const out = await runGit(['log', '-1', '--format=%h%x1f%s', ref, '--'], { cwd: repo, okExitCodes: [128] })
  const [sha, subject = ''] = out.trim().split('\x1f')
  return sha ? { name, sha, subject } : null
}

export async function readSides(repo: string): Promise<ConflictFile['sides']> {
  const operation = await readOperation(repo)
  const branch = (await runGit(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  const ours = await commitOf(repo, 'HEAD', branch || 'HEAD')
  if (!operation) return { ours, theirs: null, base: null }
  const ref = incomingRef(operation)
  const [theirs, base] = await Promise.all([
    readIncoming(repo, operation).then((name) => commitOf(repo, ref, name ?? ref)),
    runGit(['merge-base', 'HEAD', ref], { cwd: repo, okExitCodes: [1, 128] }).then((sha) =>
      sha.trim() ? commitOf(repo, sha.trim(), 'merge base') : null,
    ),
  ])
  return { ours, theirs, base }
}

type Block = Extract<ConflictSegment, { kind: 'conflict' }>
const isBlock = (segment: ConflictSegment): segment is Block => segment.kind === 'conflict'
const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, index) => line === b[index])

// A file written without diff3 markers still gets each block's base: git merges the three stages again in diff3
// style, and where those blocks match the file's (the user may have edited it since), each takes its base.
async function withBases(segments: ConflictSegment[], stages: ConflictFile['stages'], size: number) {
  const blocks = segments.filter(isBlock)
  if (!blocks.some((block) => block.base === null) || stages.ours === null || stages.theirs === null) return segments
  const dir = await mkdtemp(join(tmpdir(), 'duck-diff-merge-'))
  try {
    const [ours, base, theirs] = ['ours', 'base', 'theirs'].map((name) => join(dir, name)) as [string, string, string]
    await Promise.all([
      writeFile(ours, stages.ours),
      writeFile(base, stages.base ?? ''),
      writeFile(theirs, stages.theirs),
    ])
    // merge-file exits with the number of conflicts it left.
    const conflicts = Array.from({ length: 127 }, (_, index) => index + 1)
    const merged = await runGit(
      [
        'merge-file',
        '-p',
        '--diff3',
        `--marker-size=${size}`,
        '-L',
        'ours',
        '-L',
        'base',
        '-L',
        'theirs',
        ours,
        base,
        theirs,
      ],
      { cwd: dir, okExitCodes: conflicts },
    )
    const fresh = parseConflicts(merged, size).segments.filter(isBlock)
    if (fresh.length !== blocks.length) return segments
    let at = 0
    return segments.map((segment) => {
      if (!isBlock(segment)) return segment
      const match = fresh[at++]
      if (
        segment.base !== null ||
        !match?.base ||
        !same(match.ours, segment.ours) ||
        !same(match.theirs, segment.theirs)
      )
        return segment
      return { ...segment, base: match.base, baseLabel: 'merge base' }
    })
  } catch {
    return segments
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function readConflict(repo: string, path: string): Promise<ConflictFile> {
  if (!(await isConflicted(repo, path))) throw new GitError('failed', null, '', `${path} is not conflicted`)
  const [text, size, base, ours, theirs, sides] = await Promise.all([
    readFile(join(repo, path), 'utf8').catch(() => ''),
    markerSize(repo, path),
    stage(repo, 1, path),
    stage(repo, 2, path),
    stage(repo, 3, path),
    readSides(repo),
  ])
  const stages = { base, ours, theirs }
  const parsed = parseConflicts(text, size)
  return { path, ...parsed, segments: await withBases(parsed.segments, stages, size), stages, sides }
}

// The merged text replaces the working file and is staged, which is what marks the conflict resolved.
export async function writeResolution(repo: string, path: string, text: string): Promise<void> {
  if (!(await isConflicted(repo, path))) throw new GitError('failed', null, '', `${path} is not conflicted`)
  await writeFile(join(repo, path), text)
  await runGit(['add', '--', path], { cwd: repo })
}
