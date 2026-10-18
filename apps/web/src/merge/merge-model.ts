import type { ConflictBlock, ConflictFile, SyncStatus } from '@duck-diff/protocol'
import { diffArrays } from 'diff'

// j and k on the merge page step through its conflicts (keys/useShortcuts.ts sends it, the editor listens).
export const MERGE_STEP = 'duck-diff:merge-step'

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
  // The line it replaced or was replaced by, for marking changed words.
  partner?: string
}

// One side of a block as GitHub shows a change: against the merge base, what it removed, kept and added.
// A block with no base (a file both sides added) is all additions.
export function sideDiff(base: string[] | null, side: string[], start: number): SideLine[] {
  const parts = diffArrays(base ?? [], side)
  const lines: SideLine[] = []
  let no = start
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    if (!part) continue
    if (part.removed) {
      const next = parts[index + 1]
      const added = next?.added ? next.value : []
      for (const [at, text] of part.value.entries())
        lines.push({ kind: 'deletion', text, no: null, partner: added[at] })
      for (const [at, text] of added.entries())
        lines.push({ kind: 'addition', text, no: no++, partner: part.value[at] })
      if (next?.added) index++
    } else if (part.added) for (const text of part.value) lines.push({ kind: 'addition', text, no: no++ })
    else for (const text of part.value) lines.push({ kind: 'context', text, no: no++ })
  }
  return lines
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
