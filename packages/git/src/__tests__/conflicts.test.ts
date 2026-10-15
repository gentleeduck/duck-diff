import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { hasConflictMarkers, parseConflicts, readConflict, writeResolution } from '../index'

describe('parseConflicts', () => {
  it('splits a file into common lines and conflict blocks with their labels', () => {
    const text = 'a\n<<<<<<< HEAD\nours\n=======\ntheirs 1\ntheirs 2\n>>>>>>> feature\nz\n'
    expect(parseConflicts(text)).toEqual({
      eol: '\n',
      finalNewline: true,
      segments: [
        { kind: 'common', lines: ['a'] },
        {
          kind: 'conflict',
          ours: ['ours'],
          base: null,
          theirs: ['theirs 1', 'theirs 2'],
          oursLabel: 'HEAD',
          baseLabel: null,
          theirsLabel: 'feature',
        },
        { kind: 'common', lines: ['z'] },
      ],
    })
  })

  it('reads the base of a diff3 conflict', () => {
    const text = '<<<<<<< ours\nmine\n||||||| merged common ancestors\nold\n=======\nyours\n>>>>>>> theirs'
    const parsed = parseConflicts(text)
    expect(parsed.finalNewline).toBe(false)
    expect(parsed.segments).toEqual([
      {
        kind: 'conflict',
        ours: ['mine'],
        base: ['old'],
        theirs: ['yours'],
        oursLabel: 'ours',
        baseLabel: 'merged common ancestors',
        theirsLabel: 'theirs',
      },
    ])
  })

  it('keeps CRLF line endings and empty sides', () => {
    const parsed = parseConflicts('x\r\n<<<<<<< HEAD\r\n=======\r\nadded\r\n>>>>>>> b\r\n')
    expect(parsed.eol).toBe('\r\n')
    expect(parsed.segments[1]).toMatchObject({ ours: [], theirs: ['added'] })
  })

  it('treats a nested conflict as content of the outer one', () => {
    const text = [
      '<<<<<<< HEAD',
      'a',
      '<<<<<<< inner',
      'b',
      '=======',
      'c',
      '>>>>>>> inner',
      '=======',
      'd',
      '>>>>>>> other',
      '',
    ].join('\n')
    const [block] = parseConflicts(text).segments
    expect(block).toMatchObject({
      kind: 'conflict',
      ours: ['a', '<<<<<<< inner', 'b', '=======', 'c', '>>>>>>> inner'],
      theirs: ['d'],
    })
  })

  it('reads longer markers and an unfinished block as plain lines', () => {
    expect(parseConflicts('<<<<<<<< x\ny\n').segments).toEqual([{ kind: 'common', lines: ['<<<<<<<< x', 'y'] }])
    expect(parseConflicts('a\n<<<<<<< HEAD\nb\n').segments).toEqual([
      { kind: 'common', lines: ['a', '<<<<<<< HEAD', 'b'] },
    ])
  })

  it('honours a larger marker size', () => {
    const text = '<<<<<<<<< HEAD\n<<<<<<< not a marker\n=========\nt\n>>>>>>>>> b\n'
    expect(parseConflicts(text, 9).segments[0]).toMatchObject({ ours: ['<<<<<<< not a marker'], theirs: ['t'] })
  })

  it('tells whether markers are left', () => {
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\n')).toBe(true)
    expect(hasConflictMarkers('a\n=======\nb\n')).toBe(false)
  })
})

let repo: TestRepo
afterEach(() => repo?.cleanup())

function conflicted(): TestRepo {
  repo = createRepo()
  repo.write('a.txt', 'one\ntwo\nthree\n')
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('a.txt', 'one\nTWO feature\nthree\n')
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('a.txt', 'one\nTWO main\nthree\n')
  repo.commit('main')
  try {
    repo.git('-c', 'merge.conflictStyle=diff3', 'merge', 'feature')
  } catch {}
  return repo
}

describe('readConflict', () => {
  it('reads the working file with its blocks and the three stages', async () => {
    conflicted()
    const file = await readConflict(repo.path, 'a.txt')
    expect(file.stages).toEqual({
      base: 'one\ntwo\nthree\n',
      ours: 'one\nTWO main\nthree\n',
      theirs: 'one\nTWO feature\nthree\n',
    })
    expect(file.segments[1]).toMatchObject({
      kind: 'conflict',
      ours: ['TWO main'],
      base: ['two'],
      theirs: ['TWO feature'],
      theirsLabel: 'feature',
    })
  })

  it('reads a missing stage as null', async () => {
    repo = createRepo()
    repo.write('base.txt', 'x\n')
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'feature')
    repo.write('new.txt', 'from feature\n')
    repo.commit('feature')
    repo.git('checkout', '-q', 'main')
    repo.write('new.txt', 'from main\n')
    repo.commit('main')
    try {
      repo.git('merge', 'feature')
    } catch {}
    const file = await readConflict(repo.path, 'new.txt')
    expect(file.stages.base).toBeNull()
    expect(file.stages.ours).toBe('from main\n')
  })
})

describe('writeResolution', () => {
  it('writes the result and stages it', async () => {
    conflicted()
    await writeResolution(repo.path, 'a.txt', 'one\nTWO both\nthree\n')
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('a.txt')
    expect(repo.git('ls-files', '-u').trim()).toBe('')
    expect(repo.git('show', ':a.txt')).toBe('one\nTWO both\nthree')
  })

  it('refuses a file that is not conflicted', async () => {
    conflicted()
    writeFileSync(join(repo.path, 'b.txt'), 'b\n')
    await expect(writeResolution(repo.path, 'b.txt', 'x\n')).rejects.toThrow(/not conflicted/)
  })
})
