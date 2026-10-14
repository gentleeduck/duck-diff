import { describe, expect, it } from 'vitest'
import { cacheKeyFor, itemId, toDiffItem } from '../items'

const PATCH =
  'diff --git a/src/a.ts b/src/a.ts\nindex 1111111..2222222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n const x = 1\n-const y = 2\n+const y = 3\n'

const FILE = {
  path: 'src/a.ts',
  oldPath: null,
  status: 'modified' as const,
  additions: 1,
  deletions: 1,
  binary: false,
  oldSha: 'aaa',
  newSha: 'bbb',
}

describe('toDiffItem', () => {
  it('builds a diff item keyed by path with a sha cache key', () => {
    const item = toDiffItem(PATCH, FILE)
    expect(item?.id).toBe(itemId('src/a.ts'))
    expect(item?.type).toBe('diff')
    expect(item?.fileDiff.name).toBe('src/a.ts')
    expect(item?.fileDiff.cacheKey).toBe(cacheKeyFor(FILE))
    expect(item?.version).toBe(0)
  })

  it('returns null for text that is not a patch', () => {
    expect(toDiffItem('hello')).toBeNull()
  })
})
