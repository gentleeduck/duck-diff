import type { ConflictFile } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import {
  blockLines,
  conflictLines,
  eitherBlame,
  firstConflictLine,
  markerTints,
  pickedBlame,
  pickInText,
  resultText,
  segmentBlames,
  sideDiff,
  sideLineBlame,
  textBlocks,
  unresolvedCount,
} from '../merge-model'

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
      { kind: 'context', text: 'a', no: 10, at: 0 },
      { kind: 'deletion', text: 'b', no: null, at: 1, partner: 'B' },
      { kind: 'addition', text: 'B', no: 11, at: 1, partner: 'b' },
      { kind: 'context', text: 'c', no: 12, at: 2 },
      { kind: 'addition', text: 'd', no: 13, at: 3 },
    ])
  })

  it('reads a block without a base as all added', () => {
    expect(sideDiff(null, ['x'], 1)).toEqual([{ kind: 'addition', text: 'x', no: 1, at: 0 }])
  })
})

describe('blame on the merge page', () => {
  const who = (sha: string, text: string) => ({ sha, author: sha, time: 0, summary: '', text })
  const shas = (lines: readonly ({ sha: string } | undefined)[] | undefined) => lines?.map((line) => line?.sha)
  const labels = { oursLabel: 'HEAD', baseLabel: 'base', theirsLabel: 'x' }
  const merged: ConflictFile = {
    ...file,
    segments: [
      { kind: 'common', lines: ['a', 'b theirs'] },
      { kind: 'conflict', ours: ['x ours'], base: ['x'], theirs: ['x theirs', 'y theirs'], ...labels },
      { kind: 'common', lines: ['z'] },
    ],
  }
  const blame = {
    ours: [who('o0', 'a'), who('o0', 'b'), who('o1', 'x ours'), who('o0', 'z')],
    theirs: [who('o0', 'a'), who('t1', 'b theirs'), who('t2', 'x theirs'), who('t3', 'y theirs'), who('o0', 'z')],
    base: [who('o0', 'a'), who('o0', 'b'), who('b0', 'x'), who('o0', 'z')],
  }

  it("finds each shown line in its side's blame, a line merged in from the other side in that one", () => {
    const [top, block, end] = segmentBlames(merged, blame)
    expect(shas(top?.ours)).toEqual(['o0', undefined])
    expect(shas(top?.theirs)).toEqual(['o0', 't1'])
    expect(top && shas(eitherBlame(top))).toEqual(['o0', 't1'])
    expect(shas(block?.ours)).toEqual(['o1'])
    expect(shas(block?.theirs)).toEqual(['t2', 't3'])
    expect(shas(block?.base)).toEqual(['b0'])
    expect(shas(end?.ours)).toEqual(['o0'])
  })

  it('blames a removed line at the base and the rest at the side', () => {
    const [, block] = segmentBlames(merged, blame)
    const lines = sideDiff(['x'], ['x theirs', 'y theirs'], 3)
    expect(block && shas(sideLineBlame(lines, block.theirs, block.base))).toEqual(['b0', 't2', 't3'])
  })

  it('blames a pick at the side it came from, and a hand edit at nobody', () => {
    const [, block] = segmentBlames(merged, blame)
    if (!block) throw new Error('no block')
    expect(shas(pickedBlame({ kind: 'both', first: 'theirs' }, block))).toEqual(['t2', 't3', 'o1'])
    expect(shas(pickedBlame({ kind: 'base' }, block))).toEqual(['b0'])
    expect(shas(pickedBlame({ kind: 'edit', lines: ['new', 'text'] }, block))).toEqual([undefined, undefined])
  })

  it('knows no line of a side that has no blame', () => {
    const [top] = segmentBlames(merged, { ours: null, theirs: null, base: null })
    expect(top?.ours).toEqual([undefined, undefined])
  })
})

describe('markerTints', () => {
  it('tints each side of a conflict written as text, and its markers', () => {
    const lines = ['a', '<<<<<<< HEAD', 'mine', '||||||| base', 'old', '=======', 'yours', '>>>>>>> feature', 'z']
    expect(markerTints(lines)).toEqual([null, 'marker', 'ours', 'marker', 'base', 'marker', 'theirs', 'marker', null])
  })

  it('reads a lone ======= outside a conflict as text', () => {
    expect(markerTints(['=======', 'x'])).toEqual([null, null])
  })
})

describe('picking a side in the text', () => {
  const text = [
    'a',
    '<<<<<<< HEAD',
    'mine',
    '||||||| base',
    'old',
    '=======',
    'yours',
    '>>>>>>> feature',
    'z',
    '',
  ].join('\n')

  it('finds each conflict still written into the text, and none that never closes', () => {
    expect(textBlocks(text.split('\n'))).toEqual([{ start: 1, base: 3, separator: 5, end: 7 }])
    expect(textBlocks(['<<<<<<< HEAD', 'mine', '======='])).toEqual([])
  })

  it('writes the side picked in place of the conflict, and leaves the rest as typed', () => {
    const [block] = textBlocks(text.split('\n'))
    if (!block) throw new Error('no block')
    expect(pickInText(text, block, 'ours')).toBe('a\nmine\nz\n')
    expect(pickInText(text, block, 'theirs')).toBe('a\nyours\nz\n')
    expect(pickInText(text, block, 'both')).toBe('a\nmine\nyours\nz\n')
    expect(pickInText(text, block, 'base')).toBe('a\nold\nz\n')
  })

  it('keeps CRLF line endings', () => {
    const crlf = text.replaceAll('\n', '\r\n')
    const [block] = textBlocks(crlf.split('\n'))
    if (!block) throw new Error('no block')
    expect(pickInText(crlf, block, 'theirs')).toBe('a\r\nyours\r\nz\r\n')
  })
})
