import type { ReviewComment } from '@duck-diff/protocol'
import { processFile } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { anchorComments, lineHash, lineText } from '../anchor'

function diff(body: string) {
  const fileDiff = processFile(`diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n${body}`, {
    isGitDiff: true,
  })
  if (!fileDiff) throw new Error('no diff')
  return fileDiff
}

const BEFORE = diff('@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n@@ -10,2 +10,3 @@\n ten\n+new\n eleven\n')

function comment(line: number, text: string, side: 'additions' | 'deletions' = 'additions'): ReviewComment {
  return {
    id: `c${line}`,
    target: { kind: 'unstaged' },
    path: 'a.ts',
    side,
    line,
    lineHash: lineHash(text),
    body: 'note',
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('lineHash', () => {
  it('ignores trailing whitespace only', () => {
    expect(lineHash('const a = 1  \n')).toBe(lineHash('const a = 1'))
    expect(lineHash('  const a = 1')).not.toBe(lineHash('const a = 1'))
  })
})

describe('lineText', () => {
  it('reads either side by line number and answers null outside the hunks', () => {
    expect(lineText(BEFORE, 'additions', 2)).toBe('TWO\n')
    expect(lineText(BEFORE, 'deletions', 2)).toBe('two\n')
    expect(lineText(BEFORE, 'additions', 11)).toBe('new\n')
    expect(lineText(BEFORE, 'additions', 5)).toBeNull()
  })
})

describe('anchorComments', () => {
  it('keeps a comment whose line still matches', () => {
    expect(anchorComments([comment(11, 'new')], BEFORE)).toEqual([
      { comment: comment(11, 'new'), line: 11, outdated: false },
    ])
  })

  it('follows the line when edits above move it', () => {
    const shifted = diff(
      '@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n+inserted\n three\n@@ -10,2 +11,3 @@\n ten\n+new\n eleven\n',
    )
    expect(anchorComments([comment(11, 'new')], shifted)[0]).toMatchObject({ line: 12, outdated: false })
  })

  it('marks a comment outdated when its line is gone', () => {
    const gone = diff('@@ -10,2 +10,3 @@\n ten\n+changed\n eleven\n')
    expect(anchorComments([comment(11, 'new')], gone)[0]).toMatchObject({ line: 0, outdated: true })
  })

  it('anchors deletions on the old side', () => {
    expect(anchorComments([comment(2, 'two', 'deletions')], BEFORE)[0]).toMatchObject({ line: 2, outdated: false })
  })
})
