import { describe, expect, it } from 'vitest'
import { fuzzyMatch, rankPaths } from '../fuzzy'

const FILES = [
  'apps/shop-api/src/app.module.ts',
  'apps/shop-api/src/modules/translations/translations.service.ts',
  'apps/shop-api/README.md',
  'apps/back-office/src/modules/translations/index.ts',
  'packages/db/src/schema/translations.ts',
]
const paths = (query: string) => rankPaths(FILES, query, 5).map((hit) => hit.path)

describe('fuzzy file search', () => {
  it('matches letters in order, preferring piece starts and the file name', () => {
    expect(paths('appmod')[0]).toBe('apps/shop-api/src/app.module.ts')
    expect(paths('transl')[0]).toBe('packages/db/src/schema/translations.ts')
    expect(paths('zzz')).toEqual([])
  })

  it('takes a typed path and space-separated words that must all match', () => {
    expect(paths('shop-api/translations')[0]).toBe(FILES[1])
    expect(paths('admin transl')[0]).toBe(FILES[3])
  })

  it('still finds a folder name with a typo', () => {
    expect(paths('shpo-api/a')).toContain('apps/shop-api/src/app.module.ts')
  })

  it('reports where the typed letters landed, for highlighting', () => {
    const hit = fuzzyMatch('readme', 'apps/shop-api/README.md')
    expect(hit?.positions).toEqual([21, 22, 23, 24, 25, 26])
  })
})
