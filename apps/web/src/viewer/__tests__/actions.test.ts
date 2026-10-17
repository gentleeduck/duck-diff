import type { ChangedFile } from '@duck-diff/protocol'
import { type Hunk, processFile } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { actionsFor, firstChange, hunkAt, hunkHeader, writeRequest } from '../actions'

const FILE: ChangedFile = {
  path: 'a.ts',
  oldPath: null,
  status: 'modified',
  additions: 2,
  deletions: 1,
  binary: false,
  oldSha: 'o',
  newSha: 'n',
}

function hunk(
  additionStart: number,
  additionCount: number,
  deletionStart: number,
  deletionCount: number,
  specs: string,
) {
  return { additionStart, additionCount, deletionStart, deletionCount, hunkSpecs: specs } as Hunk
}

const HUNKS = [hunk(1, 4, 1, 3, '@@ -1,3 +1,4 @@ fn\n'), hunk(20, 2, 19, 2, '@@ -19,2 +20,2 @@\n')]

describe('actionsFor', () => {
  it('allows stage and discard on unstaged changes and unstage on staged ones', () => {
    expect(actionsFor({ kind: 'unstaged' })).toEqual(['stage', 'discard'])
    expect(actionsFor({ kind: 'staged' })).toEqual(['unstage'])
    expect(actionsFor({ kind: 'local' })).toEqual([])
    expect(actionsFor({ kind: 'commit', sha: 'abc' })).toEqual([])
    // Hunks against another commit are not what the index holds, so they cannot be unstaged as they are.
    expect(actionsFor({ kind: 'staged', base: 'v1' })).toEqual([])
  })
})

describe('hunkAt', () => {
  it('finds the hunk holding a line on either side', () => {
    expect(hunkAt(HUNKS, 3, 'additions')).toBe(0)
    expect(hunkAt(HUNKS, 21, 'additions')).toBe(1)
    expect(hunkAt(HUNKS, 19, 'deletions')).toBe(1)
    expect(hunkAt(HUNKS, 10, 'additions')).toBeNull()
  })
})

describe('writeRequest', () => {
  it('builds hunk and file requests', () => {
    expect(hunkHeader(HUNKS[0] as Hunk)).toBe('@@ -1,3 +1,4 @@ fn')
    const file = { path: 'a.ts', oldPath: null, status: 'modified', newSha: 'n' }
    expect(writeRequest('stage', FILE, { index: 0, hunk: HUNKS[0] as Hunk })).toEqual({
      action: 'stage-hunk',
      file,
      hunkIndex: 0,
      hunkHeader: '@@ -1,3 +1,4 @@ fn',
    })
    expect(writeRequest('discard', FILE)).toEqual({ action: 'discard-file', file })
  })
})

describe('firstChange', () => {
  const parse = (body: string) => {
    const diff = processFile(`diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n${body}`, {
      isGitDiff: true,
    })
    const hunk = diff?.hunks[0]
    if (!hunk) throw new Error('no hunk')
    return hunk
  }

  it('finds the first added line after the context', () => {
    expect(firstChange(parse('@@ -4,3 +4,3 @@\n four\n-five\n+FIVE\n six\n'))).toEqual({ side: 'additions', line: 5 })
  })

  it('falls back to the removed side for pure deletions', () => {
    expect(firstChange(parse('@@ -4,3 +4,2 @@\n four\n-five\n six\n'))).toEqual({ side: 'deletions', line: 5 })
  })
})
