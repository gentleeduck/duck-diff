import type { GitHubReviewComment, ReviewComment } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { toDiffItem } from '../../lib/items'
import { lineHash } from '../anchor'
import { createAnnotator, type Note, noteKey } from '../annotations'

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

const github = (id: number, inReplyTo: number | null, line: number | null): GitHubReviewComment => ({
  id,
  author: { login: 'octo', avatarUrl: '' },
  body: `note ${id}`,
  createdAt: '2026-10-01T00:00:00Z',
  path: 'a.ts',
  line,
  startLine: null,
  reviewId: null,
  side: 'RIGHT',
  inReplyTo,
})

describe('createAnnotator', () => {
  it('groups GitHub replies under their thread on its line and leaves outdated threads out', () => {
    const annotate = createAnnotator()
    const remote = [github(1, null, 2), github(2, 1, null), github(3, null, null)]
    const [annotated] = annotate([item], [], null, new Set(), [], new Set(), remote)
    expect(annotated?.annotations).toEqual([
      { side: 'additions', lineNumber: 2, metadata: { kind: 'github', thread: [remote[0], remote[1]] } },
    ])
  })

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

describe('note keys', () => {
  it('tells apart every note that can sit on one line, and stays the same across renders', () => {
    const notes: Note[] = [
      { kind: 'comment', comment, outdated: false },
      { kind: 'comment', comment: { ...comment, id: 'c2' }, outdated: false },
      { kind: 'github', thread: [github(1, null, 2)] },
      { kind: 'draft', draft: { path: 'a.ts', side: 'additions', line: 2, lineHash: 'h' } },
      { kind: 'pending', comment: { path: 'a.ts', line: 2, side: 'RIGHT', body: 'x' }, index: 0 },
      { kind: 'pending', comment: { path: 'a.ts', line: 2, side: 'RIGHT', body: 'y' }, index: 1 },
    ]
    const keys = notes.map(noteKey)
    expect(new Set(keys).size).toBe(notes.length)
    expect(notes.map(noteKey)).toEqual(keys)
  })
})
