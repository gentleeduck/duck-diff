import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { diffArrays } from 'diff'
import { GitError } from './errors'
import { type BlameText, blameText } from './ops'
import { runGit } from './run'
import { incomingRef, type Operation, readIncoming, readOperation } from './sync'

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

function fileLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/\r?\n/)
  if (text.endsWith('\n')) lines.pop()
  return lines
}

// Where each line of `from` is in `to`, or -1 for a line `to` does not have.
function matchLines(from: string[], to: string[]): number[] {
  const at = new Array<number>(from.length).fill(-1)
  let mine = 0
  let theirs = 0
  for (const part of diffArrays(from, to)) {
    const count = part.count ?? part.value.length
    if (part.added) theirs += count
    else if (part.removed) mine += count
    else for (let step = 0; step < count; step++) at[mine++] = theirs++
  }
  return at
}

// The base lines each block replaced on one side: the base between the unchanged lines around the block in that
// side's file. Matching by text finds the block even where common lines hold the other side's clean changes.
function baseRanges(segments: ConflictSegment[], side: 'ours' | 'theirs', text: string, base: string[]) {
  const shown = segments.map((segment) => (segment.kind === 'common' ? segment.lines : segment[side]))
  const sideLines = fileLines(text)
  const inSide = matchLines(shown.flat(), sideLines)
  const inBase = matchLines(sideLines, base)
  const ranges = new Map<number, [number, number]>()
  let at = 0
  for (const [index, lines] of shown.entries()) {
    const from = at
    at += lines.length
    if (segments[index]?.kind !== 'conflict') continue
    // The block's lines in the side's file, or where it would be for a side that removed everything.
    let before = from - 1
    while (before >= 0 && (inSide[before] ?? -1) < 0) before--
    let after = at
    while (after < inSide.length && (inSide[after] ?? -1) < 0) after++
    const first = before >= 0 ? (inSide[before] ?? -1) + 1 : 0
    const last = after < inSide.length ? (inSide[after] ?? sideLines.length) : sideLines.length
    // Out to the nearest lines the side kept from the base.
    let open = first - 1
    while (open >= 0 && (inBase[open] ?? -1) < 0) open--
    let close = last
    while (close < inBase.length && (inBase[close] ?? -1) < 0) close++
    ranges.set(index, [
      open >= 0 ? (inBase[open] ?? -1) + 1 : 0,
      close < inBase.length ? (inBase[close] ?? base.length) : base.length,
    ])
  }
  return ranges
}

// A file written without diff3 markers still gets each block's base, found by where it sits in each side's file:
// git folds blocks split by a lone brace and trims shared lines, so a fresh diff3 merge's blocks need not match.
function withBases(segments: ConflictSegment[], stages: ConflictFile['stages']): ConflictSegment[] {
  if (stages.base === null || stages.ours === null || stages.theirs === null) return segments
  if (!segments.some((segment) => segment.kind === 'conflict' && segment.base === null)) return segments
  const base = fileLines(stages.base)
  const ours = baseRanges(segments, 'ours', stages.ours, base)
  const theirs = baseRanges(segments, 'theirs', stages.theirs, base)
  let taken = 0
  return segments.map((segment, index): ConflictSegment => {
    if (segment.kind !== 'conflict') return segment
    const [a = 0, b = 0] = ours.get(index) ?? []
    const [c = 0, d = 0] = theirs.get(index) ?? []
    // Never a base line twice, so taking the base for every block writes each line once.
    const start = Math.max(Math.min(a, c), taken)
    const end = Math.max(b, d, start)
    taken = end
    if (segment.base !== null) return segment
    return { ...segment, base: base.slice(start, end), baseLabel: 'merge base' }
  })
}

// Resolved since the page listed it, in the merge page or a terminal: stale, not a failure.
const notConflicted = (path: string) => new GitError('stale', null, '', `${path} is not conflicted`)

export async function readConflict(repo: string, path: string): Promise<ConflictFile> {
  if (!(await isConflicted(repo, path))) throw notConflicted(path)
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
  return { path, ...parsed, segments: withBases(parsed.segments, stages), stages, sides }
}

export interface ConflictBlame {
  ours: BlameText[] | null
  theirs: BlameText[] | null
  base: BlameText[] | null
}

// The commits holding each side's version of a file: a revert brings in the reverted commit's parent against the
// commit itself, and a pick or a rebase step is applied against its own parent rather than the merge base.
async function blameRefs(repo: string, operation: Operation | null): Promise<{ theirs?: string; base?: string }> {
  if (!operation) return {}
  const ref = incomingRef(operation)
  if (operation === 'revert') return { theirs: `${ref}^`, base: ref }
  if (operation !== 'merge') return { theirs: ref, base: `${ref}^` }
  const base = (await runGit(['merge-base', 'HEAD', ref], { cwd: repo, okExitCodes: [1, 128] })).trim()
  return { theirs: ref, base: base || undefined }
}

// Who last changed each line of each side. A side without the file (added on the other side only) has none.
export async function conflictBlame(repo: string, path: string): Promise<ConflictBlame> {
  const refs = await blameRefs(repo, await readOperation(repo))
  const at = (ref: string | undefined) => (ref ? blameText(repo, path, ref).catch(() => null) : Promise.resolve(null))
  const [ours, theirs, base] = await Promise.all([at('HEAD'), at(refs.theirs), at(refs.base)])
  return { ours, theirs, base }
}

// The merged text replaces the working file and is staged, which is what marks the conflict resolved.
export async function writeResolution(repo: string, path: string, text: string): Promise<void> {
  if (!(await isConflicted(repo, path))) throw notConflicted(path)
  await writeFile(join(repo, path), text)
  await runGit(['add', '--', path], { cwd: repo })
}

const pathsOf = (out: string) => [
  ...new Set(
    out
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.slice(entry.indexOf('\t') + 1)),
  ),
]

// Files resolved since the operation stopped. git keeps their conflict until the next merge or step rewrites the
// index, and keeps it past the commit too, so only an operation still in progress counts.
export async function resolvedPaths(repo: string): Promise<string[]> {
  if (!(await readOperation(repo))) return []
  const [undo, open] = await Promise.all([
    runGit(['ls-files', '--resolve-undo', '-z'], { cwd: repo }),
    runGit(['ls-files', '--unmerged', '-z'], { cwd: repo }),
  ])
  const still = new Set(pathsOf(open))
  return pathsOf(undo).filter((path) => !still.has(path))
}

// Throws away a file's resolution and writes its conflict back as git first did. A file one side deleted has no
// markers to write, so it comes back as the side that kept it, which is how git left it.
export async function reopenConflict(repo: string, path: string): Promise<void> {
  if (!(await resolvedPaths(repo)).includes(path))
    throw new GitError('failed', null, '', `${path} was not resolved in this operation`)
  await runGit(['update-index', '--unresolve', '--', path], { cwd: repo })
  const stages = new Set(
    (await runGit(['ls-files', '--unmerged', '--', path], { cwd: repo }))
      .split('\n')
      .map((line) => line.split('\t')[0]?.split(' ')[2]),
  )
  const both = stages.has('2') && stages.has('3')
  await runGit(['checkout', both ? '-m' : stages.has('2') ? '--ours' : '--theirs', '--', path], { cwd: repo })
}
