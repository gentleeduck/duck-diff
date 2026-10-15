import type { ConflictBlock, ConflictFile } from '@duck-diff/protocol'

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
