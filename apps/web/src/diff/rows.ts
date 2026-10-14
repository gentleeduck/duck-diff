import type { FileDiffMetadata } from '@pierre/diffs'

export type LineKind = 'context' | 'addition' | 'deletion'

export interface DiffLine {
  kind: LineKind
  oldNo: number | null
  newNo: number | null
  text: string
  // Index of the hunk the line belongs to; -1 for unchanged lines shown from a gap.
  hunk: number
  // The line it replaced or was replaced by, for marking changed words.
  partner?: string
}

export type DiffRow =
  | { type: 'gap'; before: number; hidden: number; oldStart: number; newStart: number }
  | { type: 'hunk'; index: number; header: string }
  | { type: 'line'; line: DiffLine }
  | { type: 'pair'; left: DiffLine | null; right: DiffLine | null }

export interface RowOptions {
  // The new side of the file, used to fill gaps the reader opened.
  newLines?: readonly string[]
  // Gap ids (the index of the hunk the gap sits before) that are open.
  expanded?: ReadonlySet<number>
}

const strip = (text: string | undefined) => (text ?? '').replace(/\r?\n$/, '')

function hunkLines(diff: FileDiffMetadata, index: number): DiffLine[][] {
  const hunk = diff.hunks[index]
  if (!hunk) return []
  let oldNo = hunk.deletionStart
  let newNo = hunk.additionStart
  const blocks: DiffLine[][] = []
  for (const part of hunk.hunkContent) {
    if (part.type === 'context') {
      const block: DiffLine[] = []
      for (let i = 0; i < part.lines; i++) {
        const text = strip(diff.additionLines[part.additionLineIndex + i])
        block.push({ kind: 'context', oldNo: oldNo++, newNo: newNo++, text, hunk: index })
      }
      blocks.push(block)
    } else {
      const block: DiffLine[] = []
      for (let i = 0; i < part.deletions; i++) {
        const text = strip(diff.deletionLines[part.deletionLineIndex + i])
        block.push({ kind: 'deletion', oldNo: oldNo++, newNo: null, text, hunk: index })
      }
      for (let i = 0; i < part.additions; i++) {
        const text = strip(diff.additionLines[part.additionLineIndex + i])
        block.push({ kind: 'addition', oldNo: null, newNo: newNo++, text, hunk: index })
      }
      for (let i = 0; i < Math.min(part.deletions, part.additions); i++) {
        const removed = block[i]
        const added = block[part.deletions + i]
        if (removed && added) {
          removed.partner = added.text
          added.partner = removed.text
        }
      }
      blocks.push(block)
    }
  }
  return blocks
}

function pairs(block: DiffLine[]): DiffRow[] {
  if (block[0]?.kind === 'context') return block.map((line) => ({ type: 'pair', left: line, right: line }))
  const deletions = block.filter((line) => line.kind === 'deletion')
  const additions = block.filter((line) => line.kind === 'addition')
  const rows: DiffRow[] = []
  for (let i = 0; i < Math.max(deletions.length, additions.length); i++) {
    rows.push({ type: 'pair', left: deletions[i] ?? null, right: additions[i] ?? null })
  }
  return rows
}

function gapLines(gap: Extract<DiffRow, { type: 'gap' }>, newLines: readonly string[]): DiffLine[] {
  return Array.from({ length: gap.hidden }, (_, i) => ({
    kind: 'context' as const,
    oldNo: gap.oldStart + i,
    newNo: gap.newStart + i,
    text: newLines[gap.newStart + i - 1] ?? '',
    hunk: -1,
  }))
}

// Turns one parsed file into the rows the viewer draws, in unified or split layout.
export function buildRows(diff: FileDiffMetadata, layout: 'unified' | 'split', options: RowOptions = {}): DiffRow[] {
  const rows: DiffRow[] = []
  const addGap = (gap: Extract<DiffRow, { type: 'gap' }>) => {
    if (gap.hidden <= 0) return
    if (options.expanded?.has(gap.before) && options.newLines) {
      const lines = gapLines(gap, options.newLines)
      if (layout === 'split') rows.push(...lines.map((line) => ({ type: 'pair' as const, left: line, right: line })))
      else rows.push(...lines.map((line) => ({ type: 'line' as const, line })))
    } else rows.push(gap)
  }
  diff.hunks.forEach((hunk, index) => {
    addGap({
      type: 'gap',
      before: index,
      hidden: hunk.collapsedBefore,
      oldStart: hunk.deletionStart - hunk.collapsedBefore,
      newStart: hunk.additionStart - hunk.collapsedBefore,
    })
    rows.push({ type: 'hunk', index, header: (hunk.hunkSpecs ?? '').split('\n')[0]?.trim() ?? '' })
    for (const block of hunkLines(diff, index)) {
      if (layout === 'split') rows.push(...pairs(block))
      else rows.push(...block.map((line) => ({ type: 'line' as const, line })))
    }
  })
  // What follows the last hunk is only known once the whole file has been read.
  const last = diff.hunks.at(-1)
  if (last && options.newLines) {
    const newStart = last.additionStart + last.additionCount
    addGap({
      type: 'gap',
      before: diff.hunks.length,
      hidden: options.newLines.length - newStart + 1,
      oldStart: last.deletionStart + last.deletionCount,
      newStart,
    })
  }
  return rows
}
