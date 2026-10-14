import type { ReviewComment } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { toDiffItem } from '../../lib/items'
import { lineHash } from '../anchor'
import { createAnnotator } from '../annotations'

const PATCH = 'diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n'
const item = toDiffItem(PATCH)
if (!item) throw new Error('no item')
const other = toDiffItem(PATCH.replaceAll('a.ts', 'b.ts'))
if (!other) throw new Error('no item')

const comment: ReviewComment = {
  id: 'c1',
  target: { kind: 'unstaged' },
  path: 'a.ts',
  side: 'additions',
  line: 2,
  lineHash: lineHash('TWO'),
  body: 'shout less',
  createdAt: 1,
  updatedAt: 1,
}

describe('createAnnotator', () => {
  it('puts comments and the draft on their lines', () => {
    const annotate = createAnnotator()
    const [annotated] = annotate([item], [comment], { path: 'a.ts', side: 'deletions', line: 2, lineHash: 'x' })
    expect(annotated?.annotations).toEqual([
      { side: 'additions', lineNumber: 2, metadata: { kind: 'comment', comment, outdated: false } },
      {
        side: 'deletions',
        lineNumber: 2,
        metadata: { kind: 'draft', draft: { path: 'a.ts', side: 'deletions', line: 2, lineHash: 'x' } },
      },
    ])
  })

  it('keeps identity while nothing changed and bumps the version when notes change', () => {
    const annotate = createAnnotator()
    const first = annotate([item, other], [comment], null)
    const again = annotate([item, other], [comment], null)
    expect(again[0]).toBe(first[0])
    expect(again[1]).toBe(first[1])
    const edited = annotate([item, other], [{ ...comment, body: 'fine', updatedAt: 2 }], null)
    expect(edited[0]).not.toBe(first[0])
    expect(edited[0]?.version).not.toBe(first[0]?.version)
    expect(edited[1]).toBe(first[1])
  })

  it('bumps the version when the file itself is replaced', () => {
    const annotate = createAnnotator()
    const first = annotate([item], [], null)
    const replaced = toDiffItem(PATCH.replace('+TWO', '+Two'))
    if (!replaced) throw new Error('no item')
    expect(annotate([replaced], [], null)[0]?.version).not.toBe(first[0]?.version)
  })

  it('shows outdated comments above the file', () => {
    const annotate = createAnnotator()
    const [annotated] = annotate([item], [{ ...comment, lineHash: 'gone' }], null)
    expect(annotated?.annotations?.[0]).toMatchObject({ lineNumber: 0, metadata: { outdated: true } })
  })

  it('collapses folded files and opens them again', () => {
    const annotate = createAnnotator()
    const folded = annotate([item], [], null, new Set(['a.ts']))
    expect(folded[0]?.collapsed).toBe(true)
    const opened = annotate([item], [], null, new Set())
    expect(opened[0]?.collapsed).toBe(false)
    expect(opened[0]?.version).not.toBe(folded[0]?.version)
  })
})
