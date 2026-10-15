import { describe, expect, it } from 'vitest'
import { parseSearch, rank, rankPaths } from '../rank'

describe('palette search', () => {
  it('reads GitHub-style scopes', () => {
    expect(parseSearch('file: viewer')).toEqual({ scope: 'file', term: 'viewer' })
    expect(parseSearch('prs:merge box')).toEqual({ scope: 'pr', term: 'merge box' })
    expect(parseSearch('issue:')).toEqual({ scope: 'issue', term: '' })
    expect(parseSearch('#28')).toEqual({ scope: 'number', term: '28' })
    expect(parseSearch('> fetch')).toEqual({ scope: 'command', term: 'fetch' })
    expect(parseSearch('plain words')).toEqual({ scope: 'all', term: 'plain words' })
  })

  it('ranks whole matches in the file name first, then scattered letters', () => {
    const files = ['src/viewer/FileHeader.tsx', 'src/files/FileView.tsx', 'docs/fv.md', 'src/app/App.tsx']
    expect(rank(files, 'fileview', (path) => path, 5)).toEqual(['src/files/FileView.tsx'])
    expect(rank(files, 'fhead', (path) => path, 5)).toEqual(['src/viewer/FileHeader.tsx'])
    expect(rank(files, 'fv', (path) => path, 5)[0]).toBe('docs/fv.md')
    expect(rank(files, 'zzz', (path) => path, 5)).toEqual([])
  })

  it('takes a typed path: each piece in order, folders and file names alike', () => {
    const files = [
      'apps/shop-api/src/modules/translations/translations.service.ts',
      'apps/shop-api/README.md',
      'apps/back-office/src/modules/translations/index.ts',
      'packages/db/src/schema/translations.ts',
    ]
    expect(rankPaths(files, 'shop-api/translations', 5)).toEqual([files[0]])
    expect(rankPaths(files, 'shop-api/', 5)).toEqual([files[1], files[0]])
    expect(rankPaths(files, 'admin transl', 5)).toEqual([files[2]])
    // A typo still finds it, as letters in order, below exact pieces.
    expect(rankPaths(files, 'markteplace/readme', 5)).toEqual([files[1]])
    expect(rankPaths(files, 'db/schema/zzz', 5)).toEqual([])
  })
})
