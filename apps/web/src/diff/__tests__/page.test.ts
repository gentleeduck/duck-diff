import { describe, expect, it } from 'vitest'
import { toDiffItem } from '../../lib/items'
import type { NoteItem } from '../../review/annotations'
import { anchorId, buildPage } from '../page'

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

describe('anchorId', () => {
  const GAPPED =
    'diff --git a/c.ts b/c.ts\nindex 1..2 100644\n--- a/c.ts\n+++ b/c.ts\n@@ -5,2 +5,2 @@\n five\n-six\n+SIX\n'
  const item = toDiffItem(GAPPED) as NoteItem
  const lines = ['one', 'two', 'three', 'four', 'five', 'SIX']

  it('names a code line the same before and after the gap above it opens', () => {
    const closed = buildPage([item], 'unified', () => ({ key: 'patch' }))
    const open = buildPage([item], 'unified', () => ({ key: 'full', newLines: lines, expanded: new Set([0]) }))
    const ids = (page: typeof closed) => page.rows.map(anchorId)
    const changed = ids(closed).find((id) => id.endsWith(':new:6'))
    expect(changed).toBeDefined()
    expect(ids(open)).toContain(changed)
    // The row keys differ, which is why the diff anchors on these instead.
    const key = (page: typeof closed) => page.rows.find((row) => anchorId(row) === changed)?.key
    expect(key(open)).not.toBe(key(closed))
    expect(ids(open)).toContain(`${item.id}:new:2`)
    expect(ids(closed)).toContain(`${item.id}:gap:0`)
  })
})
