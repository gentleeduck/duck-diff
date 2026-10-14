import { processFile } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { buildRows, type DiffLine } from '../rows'

function parse(body: string) {
  const diff = processFile(`diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n${body}`, {
    isGitDiff: true,
  })
  if (!diff) throw new Error('no diff')
  return diff
}

// Lines 1-3 unchanged before the hunk at 4; one change, one added line, then context.
const DIFF = parse('@@ -4,4 +4,5 @@ function main\n four\n-five\n+FIVE\n+extra\n six\n seven\n')

const text = (line: DiffLine | null) =>
  line ? `${line.kind[0]}${line.oldNo ?? '_'}/${line.newNo ?? '_'} ${line.text}` : null

describe('buildRows', () => {
  it('lays out a unified hunk with numbers on both sides and a gap for the hidden lines above', () => {
    const rows = buildRows(DIFF, 'unified')
    expect(rows[0]).toMatchObject({ type: 'gap', hidden: 3, before: 0 })
    expect(rows[1]).toMatchObject({ type: 'hunk', index: 0, header: '@@ -4,4 +4,5 @@ function main' })
    expect(rows.slice(2).map((row) => (row.type === 'line' ? text(row.line) : row.type))).toEqual([
      'c4/4 four',
      'd5/_ five',
      'a_/5 FIVE',
      'a_/6 extra',
      'c6/7 six',
      'c7/8 seven',
    ])
  })

  it('pairs removed and added lines side by side in split mode', () => {
    const rows = buildRows(DIFF, 'split').filter((row) => row.type === 'pair')
    expect(rows.map((row) => (row.type === 'pair' ? [text(row.left), text(row.right)] : null))).toEqual([
      ['c4/4 four', 'c4/4 four'],
      ['d5/_ five', 'a_/5 FIVE'],
      [null, 'a_/6 extra'],
      ['c6/7 six', 'c6/7 six'],
      ['c7/8 seven', 'c7/8 seven'],
    ])
  })

  it('fills a gap with unchanged lines from the full file when they are known', () => {
    const contents = ['one', 'two', 'three', 'four', 'FIVE', 'extra', 'six', 'seven']
    const rows = buildRows(DIFF, 'unified', { newLines: contents, expanded: new Set([0]) })
    expect(rows.slice(0, 3).map((row) => (row.type === 'line' ? text(row.line) : row.type))).toEqual([
      'c1/1 one',
      'c2/2 two',
      'c3/3 three',
    ])
  })

  it('tags each line with its hunk so writes and comments know where they belong', () => {
    const rows = buildRows(DIFF, 'unified')
    const lines = rows.flatMap((row) => (row.type === 'line' ? [row.line.hunk] : []))
    expect(new Set(lines)).toEqual(new Set([0]))
  })

  it('adds the lines after the last hunk once the whole file is known', () => {
    const contents = ['one', 'two', 'three', 'four', 'FIVE', 'extra', 'six', 'seven', 'eight', 'nine']
    const closed = buildRows(DIFF, 'unified', { newLines: contents })
    expect(closed.at(-1)).toMatchObject({ type: 'gap', before: 1, hidden: 2, newStart: 9, oldStart: 8 })
    const open = buildRows(DIFF, 'unified', { newLines: contents, expanded: new Set([1]) })
    expect(open.slice(-2).map((row) => (row.type === 'line' ? text(row.line) : row.type))).toEqual([
      'c8/9 eight',
      'c9/10 nine',
    ])
  })
})
