import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import {
  conflictBlame,
  hasConflictMarkers,
  parseConflicts,
  readConflict,
  reopenConflict,
  resolvedPaths,
  writeResolution,
} from '../index'

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

function conflicted(style = 'diff3'): TestRepo {
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
    repo.git('-c', `merge.conflictStyle=${style}`, 'merge', 'feature')
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

  it('finds the base of a block written without diff3 markers', async () => {
    conflicted('merge')
    const file = await readConflict(repo.path, 'a.txt')
    expect(file.segments[1]).toMatchObject({
      kind: 'conflict',
      ours: ['TWO main'],
      base: ['two'],
      theirs: ['TWO feature'],
    })
  })

  it('finds the base of a block git folded from two, and of one it trimmed to the lines that differ', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\none\n}\ntwo\nz\nkeep\nkeep\nkeep\nb1\nb2\nb3\nend\n')
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'feature')
    repo.write('a.txt', 'a\nONE feature\n}\nTWO feature\nz\nkeep\nkeep\nkeep\nsame\nfeature\nsame too\nend\n')
    repo.commit('feature')
    repo.git('checkout', '-q', 'main')
    repo.write('a.txt', 'a\nONE main\n}\nTWO main\nz\nkeep\nkeep\nkeep\nsame\nmain\nsame too\nend\n')
    repo.commit('main')
    try {
      repo.git('-c', 'merge.conflictStyle=merge', 'merge', 'feature')
    } catch {}
    const blocks = (await readConflict(repo.path, 'a.txt')).segments.filter((segment) => segment.kind === 'conflict')
    expect(blocks).toMatchObject([
      { ours: ['ONE main', '}', 'TWO main'], base: ['one', '}', 'two'], theirs: ['ONE feature', '}', 'TWO feature'] },
      { ours: ['main'], base: ['b1', 'b2', 'b3'], theirs: ['feature'] },
    ])
  })

  it('names the commits on each side and their merge base', async () => {
    conflicted()
    const file = await readConflict(repo.path, 'a.txt')
    const short = (ref: string) => repo.git('rev-parse', '--short', ref).trim()
    expect(file.sides).toEqual({
      ours: { name: 'main', sha: short('main'), subject: 'main' },
      theirs: { name: 'feature', sha: short('feature'), subject: 'feature' },
      base: { name: 'merge base', sha: short('main~1'), subject: 'base' },
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

describe('conflictBlame', () => {
  const sha = (ref: string) => repo.git('rev-parse', ref).trim()
  const pairs = (lines: { text: string; sha: string }[] | null) => lines?.map((line) => [line.text, line.sha])

  it('blames each side at its own commit and the base at the merge base', async () => {
    conflicted()
    const blame = await conflictBlame(repo.path, 'a.txt')
    expect(pairs(blame.ours)).toEqual([
      ['one', sha('main~1')],
      ['TWO main', sha('main')],
      ['three', sha('main~1')],
    ])
    expect(blame.theirs?.[1]).toMatchObject({ text: 'TWO feature', sha: sha('feature'), summary: 'feature' })
    expect(blame.base?.[1]).toMatchObject({ text: 'two', sha: sha('main~1'), author: 'Duck Test' })
  })

  it("blames a cherry-pick's base at the picked commit's parent, not the merge base", async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\ntwo\nthree\n')
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'feature')
    repo.write('a.txt', 'one\ntwo\nTHREE\n')
    repo.commit('louder end')
    repo.write('a.txt', 'one\nTWO feature\nTHREE\n')
    const picked = repo.commit('feature')
    repo.git('checkout', '-q', 'main')
    repo.write('a.txt', 'one\nTWO main\nthree\n')
    repo.commit('main')
    try {
      repo.git('cherry-pick', picked)
    } catch {}
    const blame = await conflictBlame(repo.path, 'a.txt')
    expect(blame.theirs?.[1]).toMatchObject({ text: 'TWO feature', sha: picked })
    expect(blame.base?.[2]).toMatchObject({ text: 'THREE', sha: sha('feature~1') })
  })

  it('has nothing for a side that does not have the file', async () => {
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
    const blame = await conflictBlame(repo.path, 'new.txt')
    expect(blame.base).toBeNull()
    expect(pairs(blame.ours)).toEqual([['from main', sha('main')]])
    expect(pairs(blame.theirs)).toEqual([['from feature', sha('feature')]])
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
    await expect(writeResolution(repo.path, 'b.txt', 'x\n')).rejects.toMatchObject({ code: 'stale' })
    await expect(readConflict(repo.path, 'b.txt')).rejects.toMatchObject({
      code: 'stale',
      message: 'b.txt is not conflicted',
    })
  })
})

describe('reopenConflict', () => {
  it('lists a file resolved during the merge and puts its conflict back', async () => {
    conflicted()
    await writeResolution(repo.path, 'a.txt', 'one\nTWO both\nthree\n')
    expect(await resolvedPaths(repo.path)).toEqual(['a.txt'])
    await reopenConflict(repo.path, 'a.txt')
    expect(await resolvedPaths(repo.path)).toEqual([])
    const file = await readConflict(repo.path, 'a.txt')
    expect(file.segments[1]).toMatchObject({ kind: 'conflict', ours: ['TWO main'], theirs: ['TWO feature'] })
  })

  it('lists nothing once the merge is committed', async () => {
    conflicted()
    await writeResolution(repo.path, 'a.txt', 'one\nTWO both\nthree\n')
    repo.git('commit', '-q', '--no-edit')
    expect(await resolvedPaths(repo.path)).toEqual([])
    await expect(reopenConflict(repo.path, 'a.txt')).rejects.toThrow(/not resolved/)
  })

  it('brings back a file one side deleted as git left it', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'feature')
    repo.git('rm', '-q', 'a.txt')
    repo.commit('feature')
    repo.git('checkout', '-q', 'main')
    repo.write('a.txt', 'one changed\n')
    repo.commit('main')
    try {
      repo.git('merge', 'feature')
    } catch {}
    repo.git('rm', '-q', 'a.txt')
    expect(await resolvedPaths(repo.path)).toEqual(['a.txt'])
    await reopenConflict(repo.path, 'a.txt')
    expect(repo.git('ls-files', '-u').trim()).not.toBe('')
    expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('one changed\n')
  })

  it('refuses a file that was not resolved', async () => {
    conflicted()
    await expect(reopenConflict(repo.path, 'a.txt')).rejects.toThrow(/not resolved/)
  })
})
