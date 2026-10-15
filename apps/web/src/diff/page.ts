import type { Note, NoteItem } from '../review/annotations'
import { buildRows, type DiffLine, type DiffRow, type RowOptions } from './rows'

export type PageRow =
  | { type: 'header'; key: string; item: NoteItem }
  | { type: 'row'; key: string; item: NoteItem; row: DiffRow; rowsKey: string }
  | { type: 'note'; key: string; item: NoteItem; note: Note }
  | { type: 'end'; key: string; item: NoteItem }

export interface Page {
  rows: PageRow[]
  // Index of each file's header row, by item id.
  starts: Map<string, number>
  // Index of the row that shows a line, by `${item id}:${side}:${line number}`.
  lines: Map<string, number>
  // Each open file's rows and the key they were built with, for highlighting.
  files: Map<string, { rows: DiffRow[]; key: string }>
}

type Side = 'additions' | 'deletions'

function lineKeys(id: string, line: DiffLine | null): string[] {
  if (!line) return []
  const keys: string[] = []
  if (line.newNo !== null && line.kind !== 'deletion') keys.push(`${id}:additions:${line.newNo}`)
  if (line.oldNo !== null && line.kind !== 'addition') keys.push(`${id}:deletions:${line.oldNo}`)
  return keys
}

function rowLineKeys(id: string, row: DiffRow): string[] {
  if (row.type === 'line') return lineKeys(id, row.line)
  if (row.type === 'pair') return [...lineKeys(id, row.left), ...lineKeys(id, row.right)]
  return []
}

// Every file becomes a header, its rows unless folded, and notes placed after the line they belong to.
export function buildPage(
  items: readonly NoteItem[],
  layout: 'unified' | 'split',
  optionsFor: (item: NoteItem) => RowOptions & { key: string },
): Page {
  const rows: PageRow[] = []
  const starts = new Map<string, number>()
  const lines = new Map<string, number>()
  const files = new Map<string, { rows: DiffRow[]; key: string }>()
  for (const item of items) {
    starts.set(item.id, rows.length)
    rows.push({ type: 'header', key: `${item.id}:header`, item })
    const notes = item.annotations ?? []
    for (const [i, annotation] of notes.entries()) {
      if (annotation.lineNumber === 0 && annotation.metadata) {
        rows.push({ type: 'note', key: `${item.id}:note:top:${i}`, item, note: annotation.metadata })
      }
    }
    if (!item.collapsed) {
      const options = optionsFor(item)
      const placed = new Map<string, Note[]>()
      for (const annotation of notes) {
        if (annotation.lineNumber === 0 || !annotation.metadata) continue
        const at = `${item.id}:${annotation.side as Side}:${annotation.lineNumber}`
        placed.set(at, [...(placed.get(at) ?? []), annotation.metadata])
      }
      const fileRows = buildRows(item.fileDiff, layout, options)
      files.set(item.id, { rows: fileRows, key: options.key })
      for (const [i, row] of fileRows.entries()) {
        const keys = rowLineKeys(item.id, row)
        for (const key of keys) if (!lines.has(key)) lines.set(key, rows.length)
        rows.push({ type: 'row', key: `${item.id}:${options.key}:${i}`, item, row, rowsKey: options.key })
        for (const key of new Set(keys)) {
          for (const [n, note] of (placed.get(key) ?? []).entries()) {
            rows.push({ type: 'note', key: `${key}:note:${n}`, item, note })
          }
          placed.delete(key)
        }
      }
    }
    rows.push({ type: 'end', key: `${item.id}:end`, item })
  }
  return { rows, starts, lines, files }
}

// What a row is, as opposed to where it sits: the same code line keeps it when a gap above opens and every
// row key in the file changes. The diff keeps that row in place on screen across such a rebuild.
export function anchorId(row: PageRow): string {
  if (row.type !== 'row') return row.key
  const diff = row.row
  const id = row.item.id
  if (diff.type === 'gap') return `${id}:gap:${diff.before}`
  if (diff.type === 'hunk') return `${id}:hunk:${diff.index}`
  const line = diff.type === 'line' ? diff.line : (diff.right ?? diff.left)
  if (!line) return row.key
  return line.newNo !== null ? `${id}:new:${line.newNo}` : `${id}:old:${line.oldNo}`
}
