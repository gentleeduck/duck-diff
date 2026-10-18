import type { BlameLine, ConflictBlame, ConflictBlock, ConflictFile, SyncStatus } from '@duck-diff/protocol'
import { diffArrays } from 'diff'

// j and k on the merge page step through its conflicts (keys/useShortcuts.ts sends it, the editor listens).
export const MERGE_STEP = 'duck-diff:merge-step'
// b on the merge page shows or hides who last changed each line.
export const MERGE_BLAME = 'duck-diff:merge-blame'

export type Choice =
  | { kind: 'ours' }
  | { kind: 'theirs' }
  | { kind: 'base' }
  | { kind: 'both'; first: 'ours' | 'theirs' }
  | { kind: 'edit'; lines: string[] }

// Keyed by segment index; a block without a choice stays a conflict.
export type Choices = Record<number, Choice>

const MARKER = 7

export function conflictLines(block: ConflictBlock): string[] {
  const label = (char: string, text: string | null) => char.repeat(MARKER) + (text ? ` ${text}` : '')
  return [
    label('<', block.oursLabel),
    ...block.ours,
    ...(block.base ? [label('|', block.baseLabel), ...block.base] : []),
    '='.repeat(MARKER),
    ...block.theirs,
    label('>', block.theirsLabel),
  ]
}

export function blockLines(block: ConflictBlock, choice: Choice | undefined): string[] | null {
  if (!choice) return null
  switch (choice.kind) {
    case 'ours':
      return block.ours
    case 'theirs':
      return block.theirs
    case 'base':
      return block.base ?? []
    case 'both':
      return choice.first === 'ours' ? [...block.ours, ...block.theirs] : [...block.theirs, ...block.ours]
    case 'edit':
      return choice.lines
  }
}

export function resultLines(file: ConflictFile, choices: Choices): string[] {
  return file.segments.flatMap((segment, index) =>
    segment.kind === 'common' ? segment.lines : (blockLines(segment, choices[index]) ?? conflictLines(segment)),
  )
}

export function resultText(file: ConflictFile, choices: Choices): string {
  const lines = resultLines(file, choices)
  return lines.join(file.eol) + (file.finalNewline && lines.length ? file.eol : '')
}

export function unresolvedCount(file: ConflictFile, choices: Choices): number {
  return file.segments.filter((segment, index) => segment.kind === 'conflict' && !choices[index]).length
}

// 1-based line, in the file on disk (markers and all), of the first block not yet chosen in the page.
export function firstConflictLine(file: ConflictFile, choices: Choices): number | null {
  let line = 1
  for (const [index, segment] of file.segments.entries()) {
    if (segment.kind === 'common') line += segment.lines.length
    else if (!choices[index]) return line
    else line += conflictLines(segment).length
  }
  return null
}

// Joined so the selection compares by value and the store does not re-render on every read.
export const selectConflicts = (state: { unstaged: { path: string; status: string }[] }) =>
  state.unstaged
    .filter((file) => file.status === 'conflicted')
    .map((file) => file.path)
    .join('\n')

export interface SideLine {
  kind: 'context' | 'addition' | 'deletion'
  text: string
  // The line's number in that side's file; a line the side removed has none.
  no: number | null
  // Where it is in what it came from: the base for a removed line, the side for the rest.
  at: number
  // The line it replaced or was replaced by, for marking changed words.
  partner?: string
}

// One side of a block as GitHub shows a change: against the merge base, what it removed, kept and added.
// A block with no base (a file both sides added) is all additions.
export function sideDiff(base: string[] | null, side: string[], start: number): SideLine[] {
  const parts = diffArrays(base ?? [], side)
  const lines: SideLine[] = []
  let no = start
  let from = 0
  let to = 0
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    if (!part) continue
    if (part.removed) {
      const next = parts[index + 1]
      const added = next?.added ? next.value : []
      for (const [at, text] of part.value.entries())
        lines.push({ kind: 'deletion', text, no: null, at: from++, partner: added[at] })
      for (const [at, text] of added.entries())
        lines.push({ kind: 'addition', text, no: no++, at: to++, partner: part.value[at] })
      if (next?.added) index++
    } else if (part.added) for (const text of part.value) lines.push({ kind: 'addition', text, no: no++, at: to++ })
    else
      for (const text of part.value) {
        lines.push({ kind: 'context', text, no: no++, at: to++ })
        from++
      }
  }
  return lines
}

// A line's blame, or undefined where its side has no blame or the line is not in the blamed version.
export type Who = BlameLine | undefined

// Per segment: the blame of each line as each column shows it. A common segment's lines read the same in every
// column, but only one side may have them: a line the other side brought in cleanly is not in this side's file.
export interface SegmentBlame {
  ours: Who[]
  theirs: Who[]
  base: Who[]
}

// Finds what one column shows (every common line and that side's part of each block) in the side's blamed file.
function align(file: ConflictFile, blamed: ConflictBlame['ours'], side: (block: ConflictBlock) => string[] | null) {
  const shown = file.segments.map((segment) => (segment.kind === 'common' ? segment.lines : (side(segment) ?? [])))
  const found: Who[][] = shown.map((lines) => lines.map(() => undefined))
  if (!blamed) return found
  const flat = shown.flatMap((lines, segment) => lines.map((_, line) => [segment, line] as const))
  const parts = diffArrays(
    shown.flat(),
    blamed.map((line) => line.text),
  )
  let mine = 0
  let theirs = 0
  for (const part of parts) {
    const count = part.count ?? part.value.length
    if (part.added) theirs += count
    else if (part.removed) mine += count
    else
      for (let step = 0; step < count; step++) {
        const [segment, line] = flat[mine++] ?? []
        const who = blamed[theirs++]
        const row = segment === undefined ? undefined : found[segment]
        if (row && line !== undefined && who) row[line] = who
      }
  }
  return found
}

export function segmentBlames(file: ConflictFile, blame: ConflictBlame): SegmentBlame[] {
  const ours = align(file, blame.ours, (block) => block.ours)
  const theirs = align(file, blame.theirs, (block) => block.theirs)
  const base = align(file, blame.base, (block) => block.base)
  return file.segments.map((_, index) => ({
    ours: ours[index] ?? [],
    theirs: theirs[index] ?? [],
    base: base[index] ?? [],
  }))
}

// A common line as the result and the stacked layout show it once: from whichever side has it.
export const eitherBlame = (blame: SegmentBlame): Who[] => blame.ours.map((who, index) => who ?? blame.theirs[index])

export const sideLineBlame = (lines: SideLine[], side: Who[], base: Who[]): Who[] =>
  lines.map((line) => (line.kind === 'deletion' ? base[line.at] : side[line.at]))

// A pick reads as the side it was taken from; a hand edit is nobody's yet.
export function pickedBlame(choice: Choice, blame: SegmentBlame): Who[] {
  switch (choice.kind) {
    case 'ours':
      return blame.ours
    case 'theirs':
      return blame.theirs
    case 'base':
      return blame.base
    case 'both':
      return choice.first === 'ours' ? [...blame.ours, ...blame.theirs] : [...blame.theirs, ...blame.ours]
    case 'edit':
      return choice.lines.map(() => undefined)
  }
}

// What git is in the middle of, in the names of what is coming together.
export function headline(operation: SyncStatus['operation'], branch: string | null, theirs: string | null): string {
  const other = theirs ?? 'the other side'
  if (operation === 'merge') return `Merging ${other} into ${branch ?? 'HEAD'}`
  if (operation === 'cherry-pick') return `Cherry-picking ${other}`
  if (operation === 'revert') return `Reverting ${other}`
  if (operation === 'rebase') return `Rebasing, replaying ${other}`
  return 'Resolve conflicts'
}
