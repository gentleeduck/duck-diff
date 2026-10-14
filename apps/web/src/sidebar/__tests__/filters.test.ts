import type { ChangedFile } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { countByStatus, filterFiles, toGitStatus } from '../filters'

function file(path: string, status: ChangedFile['status']): ChangedFile {
  return { path, status, oldPath: null, additions: 1, deletions: 0, binary: false, oldSha: null, newSha: null }
}

const FILES = [
  file('src/App.tsx', 'modified'),
  file('src/new.ts', 'added'),
  file('docs/old.md', 'deleted'),
  file('src/moved.ts', 'renamed'),
  file('scratch.txt', 'untracked'),
  file('lib/copy.ts', 'copied'),
  file('bin/run', 'type-changed'),
]

describe('toGitStatus', () => {
  it('maps every file status onto the tree statuses', () => {
    expect(FILES.map((f) => toGitStatus(f.status))).toEqual([
      'modified',
      'added',
      'deleted',
      'renamed',
      'untracked',
      'added',
      'modified',
    ])
  })
})

describe('filterFiles', () => {
  it('keeps everything with no filters', () => {
    expect(filterFiles(FILES, new Set(), '')).toHaveLength(7)
  })

  it('filters by tree status and by a case-insensitive query', () => {
    expect(filterFiles(FILES, new Set(['added']), '').map((f) => f.path)).toEqual(['src/new.ts', 'lib/copy.ts'])
    expect(filterFiles(FILES, new Set(), 'APP').map((f) => f.path)).toEqual(['src/App.tsx'])
    expect(filterFiles(FILES, new Set(['modified']), 'bin').map((f) => f.path)).toEqual(['bin/run'])
  })
})

describe('countByStatus', () => {
  it('counts per tree status', () => {
    expect(countByStatus(FILES)).toEqual({ added: 2, modified: 2, deleted: 1, renamed: 1, untracked: 1 })
  })
})
