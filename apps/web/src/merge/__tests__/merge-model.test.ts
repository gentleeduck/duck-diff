import type { ConflictFile } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { blockLines, conflictLines, firstConflictLine, resultText, sideDiff, unresolvedCount } from '../merge-model'

const file: ConflictFile = {
  path: 'a.txt',
  eol: '\n',
  finalNewline: true,
  stages: { base: null, ours: null, theirs: null },
  sides: { ours: null, theirs: null, base: null },
  segments: [
    { kind: 'common', lines: ['top'] },
    {
      kind: 'conflict',
      ours: ['o1'],
      base: ['b1'],
      theirs: ['t1'],
      oursLabel: 'HEAD',
      baseLabel: 'base',
      theirsLabel: 'x',
    },
    { kind: 'common', lines: ['mid', 'mid2'] },
    { kind: 'conflict', ours: ['o2'], base: null, theirs: [], oursLabel: 'HEAD', baseLabel: null, theirsLabel: 'x' },
    { kind: 'common', lines: ['end'] },
  ],
}

describe('merge model', () => {
  it('builds the result from each choice and keeps markers where none is made', () => {
    expect(resultText(file, { 1: { kind: 'ours' }, 3: { kind: 'theirs' } })).toBe('top\no1\nmid\nmid2\nend\n')
    expect(resultText(file, { 1: { kind: 'both', first: 'theirs' }, 3: { kind: 'edit', lines: ['hand'] } })).toBe(
      'top\nt1\no1\nmid\nmid2\nhand\nend\n',
    )
    expect(resultText(file, { 1: { kind: 'base' } })).toBe(
      'top\nb1\nmid\nmid2\n<<<<<<< HEAD\no2\n=======\n>>>>>>> x\nend\n',
    )
  })

  it('writes the markers back as git wrote them, base included', () => {
    expect(conflictLines(file.segments[1] as never)).toEqual([
      '<<<<<<< HEAD',
      'o1',
      '||||||| base',
      'b1',
      '=======',
      't1',
      '>>>>>>> x',
    ])
  })

  it('keeps CRLF and a missing final newline', () => {
    const crlf = {
      ...file,
      eol: '\r\n' as const,
      finalNewline: false,
      segments: [{ kind: 'common' as const, lines: ['a', 'b'] }],
    }
    expect(resultText(crlf, {})).toBe('a\r\nb')
  })

  it('counts what is left and reads each choice as lines', () => {
    expect(unresolvedCount(file, { 3: { kind: 'ours' } })).toBe(1)
    expect(unresolvedCount(file, { 1: { kind: 'ours' }, 3: { kind: 'ours' } })).toBe(0)
    const block = file.segments[1] as Extract<ConflictFile['segments'][number], { kind: 'conflict' }>
    expect(blockLines(block, { kind: 'both', first: 'ours' })).toEqual(['o1', 't1'])
    expect(blockLines(block, undefined)).toBeNull()
  })

  it('finds the line of the first conflict left in the working file', () => {
    expect(firstConflictLine(file, {})).toBe(2)
    // The second block starts after top, seven marker lines and two common lines.
    expect(firstConflictLine(file, { 1: { kind: 'ours' } })).toBe(11)
    expect(firstConflictLine(file, { 1: { kind: 'ours' }, 3: { kind: 'ours' } })).toBeNull()
  })
})

describe('sideDiff', () => {
  it('shows a side against the base, pairing a replaced line with its replacement', () => {
    expect(sideDiff(['a', 'b', 'c'], ['a', 'B', 'c', 'd'], 10)).toEqual([
      { kind: 'context', text: 'a', no: 10 },
      { kind: 'deletion', text: 'b', no: null, partner: 'B' },
      { kind: 'addition', text: 'B', no: 11, partner: 'b' },
      { kind: 'context', text: 'c', no: 12 },
      { kind: 'addition', text: 'd', no: 13 },
    ])
  })

  it('reads a block without a base as all added', () => {
    expect(sideDiff(null, ['x'], 1)).toEqual([{ kind: 'addition', text: 'x', no: 1 }])
  })
})
