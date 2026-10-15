import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLinePatch, discardLines, stageLines, unstageLines } from '../index'

const HEADER = 'diff --git a/f b/f\nindex 1..2 100644\n--- a/f\n+++ b/f\n'

describe('buildLinePatch', () => {
  const patch = `${HEADER}@@ -1,4 +1,4 @@\n a\n-b\n-c\n+B\n+C\n d\n`

  it('keeps the chosen lines, turns other deletions into context and drops other additions', () => {
    const out = buildLinePatch(patch, [
      { side: 'old', line: 2, text: 'b' },
      { side: 'new', line: 2, text: 'B' },
    ])
    expect(out).toBe(`${HEADER}@@ -1,4 +1,4 @@\n a\n-b\n c\n+B\n d\n`)
  })

  it('recounts the header and moves later hunks by what earlier ones add', () => {
    const two = `${HEADER}@@ -1,2 +1,3 @@\n a\n+x\n+y\n b\n@@ -10,2 +11,2 @@\n p\n-q\n+Q\n`
    const out = buildLinePatch(two, [
      { side: 'new', line: 2, text: 'x' },
      { side: 'old', line: 11, text: 'q' },
    ])
    expect(out).toBe(`${HEADER}@@ -1,2 +1,3 @@\n a\n+x\n b\n@@ -10,2 +11,1 @@\n p\n-q\n`)
  })

  it('leaves out hunks with nothing chosen and gives null when nothing is left', () => {
    expect(buildLinePatch(patch, [])).toBeNull()
  })

  it('in reverse keeps other additions as context and drops other deletions', () => {
    const out = buildLinePatch(patch, [{ side: 'new', line: 3, text: 'C' }], true)
    expect(out).toBe(`${HEADER}@@ -1,3 +1,4 @@\n a\n B\n+C\n d\n`)
  })

  it('keeps a missing final newline right when only the addition after it is chosen', () => {
    const tail = `${HEADER}@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n`
    expect(buildLinePatch(tail, [{ side: 'new', line: 2, text: 'c' }])).toBe(
      `${HEADER}@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n\\ No newline at end of file\n`,
    )
    expect(buildLinePatch(tail, [{ side: 'old', line: 2, text: 'b' }])).toBe(
      `${HEADER}@@ -1,2 +1,1 @@\n a\n-b\n\\ No newline at end of file\n`,
    )
  })

  it('refuses lines whose text no longer matches', () => {
    expect(() => buildLinePatch(patch, [{ side: 'old', line: 2, text: 'changed' }])).toThrow(/changed/)
    expect(() => buildLinePatch(patch, [{ side: 'new', line: 9, text: 'B' }])).toThrow(/changed/)
  })
})

let repo: TestRepo
afterEach(() => repo?.cleanup())

const file = { path: 'f.txt', oldPath: null, status: 'modified' as const, newSha: null }

function setup() {
  repo = createRepo()
  repo.write('f.txt', 'one\ntwo\nthree\nfour\nfive\n')
  repo.commit('base')
  repo.write('f.txt', 'one\nTWO\nthree\nnew a\nnew b\nfour\n')
}

describe('line staging', () => {
  it('stages two lines of a hunk and leaves the rest in the working tree', async () => {
    setup()
    await stageLines(repo.path, file, [
      { side: 'old', line: 2, text: 'two' },
      { side: 'new', line: 2, text: 'TWO' },
    ])
    expect(repo.git('show', ':f.txt')).toBe('one\nTWO\nthree\nfour\nfive')
    expect(readFileSync(join(repo.path, 'f.txt'), 'utf8')).toBe('one\nTWO\nthree\nnew a\nnew b\nfour\n')
  })

  it('unstages chosen lines from the index', async () => {
    setup()
    repo.git('add', 'f.txt')
    await unstageLines(repo.path, file, [{ side: 'new', line: 4, text: 'new a' }])
    expect(repo.git('show', ':f.txt')).toBe('one\nTWO\nthree\nnew b\nfour')
  })

  it('discards chosen lines from the working tree', async () => {
    setup()
    await discardLines(repo.path, file, [{ side: 'old', line: 5, text: 'five' }])
    expect(readFileSync(join(repo.path, 'f.txt'), 'utf8')).toBe('one\nTWO\nthree\nnew a\nnew b\nfour\nfive\n')
  })
})
