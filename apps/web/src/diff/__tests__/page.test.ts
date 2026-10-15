import { describe, expect, it } from 'vitest'
import { toDiffItem } from '../../lib/items'
import type { NoteItem } from '../../review/annotations'
import { buildPage } from '../page'

const PATCH = 'diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n'
const base = toDiffItem(PATCH) as NoteItem
const other = toDiffItem(PATCH.replaceAll('a.ts', 'b.ts')) as NoteItem
const draft = { path: 'a.ts', side: 'additions' as const, line: 2, lineHash: 'h' }
const withNote: NoteItem = {
  ...base,
  annotations: [{ side: 'additions', lineNumber: 2, metadata: { kind: 'draft', draft } }],
}
const options = () => ({ key: 'k' })

describe('buildPage', () => {
  it('lists each file as a header, its rows, then an end marker, with lookups for scrolling', () => {
    const page = buildPage([base, other], 'unified', options)
    expect(page.rows.map((row) => row.type)).toEqual([
      'header',
      'row',
      'row',
      'row',
      'row',
      'end',
      'header',
      'row',
      'row',
      'row',
      'row',
      'end',
    ])
    expect(page.starts.get(other.id)).toBe(6)
    expect(page.rows[page.lines.get(`${base.id}:additions:2`) ?? -1]).toMatchObject({ row: { line: { text: 'TWO' } } })
  })

  it('places a note right after the line it is about', () => {
    const page = buildPage([withNote], 'unified', options)
    const at = page.lines.get(`${base.id}:additions:2`) ?? -1
    expect(page.rows[at + 1]).toMatchObject({ type: 'note', note: { kind: 'draft' } })
  })

  it('shows only the header for a folded file', () => {
    const page = buildPage([{ ...base, collapsed: true }], 'split', options)
    expect(page.rows.map((row) => row.type)).toEqual(['header', 'end'])
  })
})
