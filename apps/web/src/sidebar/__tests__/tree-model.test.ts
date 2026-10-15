import { describe, expect, it } from 'vitest'
import { buildTree, visibleRows } from '../tree-model'

const PATHS = ['src/a.ts', 'src/lib/b.ts', 'README.md', 'docs/guide/deep/x.md', 'file10.ts', 'file2.ts']

const names = (rows: ReturnType<typeof visibleRows>) => rows.map((row) => `${'  '.repeat(row.depth)}${row.name}`)

describe('tree model', () => {
  it('lists folders first, joins single-folder chains, and sorts naturally', () => {
    expect(names(visibleRows(buildTree(PATHS), new Set()))).toEqual([
      'docs/guide/deep',
      '  x.md',
      'src',
      '  lib',
      '    b.ts',
      '  a.ts',
      'file2.ts',
      'file10.ts',
      'README.md',
    ])
  })

  it('hides what a collapsed folder holds and keeps the ancestors for indent guides', () => {
    const rows = visibleRows(buildTree(PATHS), new Set(['src/lib']))
    expect(names(rows)).toContain('  lib')
    expect(names(rows)).not.toContain('    b.ts')
    const deep = visibleRows(buildTree(PATHS), new Set()).find((row) => row.path === 'src/lib/b.ts')
    expect(deep).toMatchObject({ depth: 2, ancestors: ['src', 'src/lib'], kind: 'file' })
    expect(rows.find((row) => row.path === 'src/lib')?.expanded).toBe(false)
  })
})

describe('tree model, closed by default', () => {
  it('shows only top-level rows until a folder is toggled open', () => {
    const tree = buildTree(['src/lib/b.ts', 'src/a.ts', 'README.md'])
    expect(names(visibleRows(tree, new Set(), false))).toEqual(['src', 'README.md'])
    expect(names(visibleRows(tree, new Set(['src']), false))).toEqual(['src', '  lib', '  a.ts', 'README.md'])
  })
})
