import type { ChangedFile } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { reviewProgress } from '../ViewedProgress'

const file = (path: string): ChangedFile => ({
  path,
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
  oldSha: 'o',
  newSha: 'n',
})

describe('reviewProgress', () => {
  it('counts the viewed files and finds the next one to read, in tree order', () => {
    const files = [file('z.ts'), file('src/b.ts'), file('src/a.ts')]
    expect(reviewProgress(files, new Set(['src/a.ts']))).toEqual({ done: 1, total: 3, next: 'src/b.ts' })
    expect(reviewProgress(files, new Set(['src/a.ts', 'src/b.ts', 'z.ts']))).toEqual({ done: 3, total: 3, next: null })
    expect(reviewProgress([], new Set())).toEqual({ done: 0, total: 0, next: null })
  })
})
