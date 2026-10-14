import type { ChangedFile } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { buildTree } from '../tree'

const file = (path: string): ChangedFile => ({
  path,
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 0,
  binary: false,
  oldSha: null,
  newSha: null,
})

describe('buildTree', () => {
  it('nests files under folders, folders first, both sorted', () => {
    const tree = buildTree([file('src/b.ts'), file('README.md'), file('src/a.ts'), file('docs/x.md')])
    expect(tree.map((node) => node.name)).toEqual(['docs', 'src', 'README.md'])
    const src = tree[1]
    expect(src?.kind === 'folder' && src.children.map((node) => node.name)).toEqual(['a.ts', 'b.ts'])
  })

  it('joins folders that only hold one folder', () => {
    const [only] = buildTree([file('apps/web/src/main.ts'), file('apps/web/src/app.ts')])
    expect(only).toMatchObject({ kind: 'folder', name: 'apps/web/src', path: 'apps/web/src' })
  })

  it('keeps the changed file on each leaf', () => {
    const [leaf] = buildTree([file('a.ts')])
    expect(leaf).toMatchObject({ kind: 'file', name: 'a.ts', path: 'a.ts', file: { path: 'a.ts' } })
  })
})
