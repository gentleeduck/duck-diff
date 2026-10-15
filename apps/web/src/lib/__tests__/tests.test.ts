import { describe, expect, it } from 'vitest'
import { isTestFile } from '../tests'

describe('isTestFile', () => {
  it('knows test folders and test file names across languages', () => {
    for (const path of [
      'src/__tests__/a.ts',
      'apps/server/e2e/viewer.e2e.ts',
      'a.test.tsx',
      'pkg/b.spec.js',
      'cmd/run_test.go',
      'tests/test_api.py',
      'test/helper.rb',
      'bench/viewer.bench.ts',
    ]) {
      expect(isTestFile(path), path).toBe(true)
    }
    for (const path of ['src/app.ts', 'src/testing.ts', 'docs/latest.md', 'src/contest/x.ts']) {
      expect(isTestFile(path), path).toBe(false)
    }
  })
})
