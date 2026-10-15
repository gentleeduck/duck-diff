export interface HidePattern {
  id: string
  label: string
  // A regular expression tested against the file's path from the repo root.
  pattern: string
  enabled: boolean
}

// The test conventions of lib/tests.ts as one expression, so they can be read and edited like any other.
const TESTS =
  '(^|/)(__tests__|__mocks__|tests?|specs?|e2e|testdata|fixtures)/|\\.(test|spec|e2e|bench)\\.[^/]+$|_test\\.[^/]+$|(^|/)test_[^/]+\\.py$'

export const DEFAULT_HIDE: HidePattern[] = [{ id: 'tests', label: 'Test files', pattern: TESTS, enabled: false }]

export function validPattern(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return pattern.length > 0
  } catch {
    return false
  }
}

// One test for every enabled pattern; a pattern that does not compile hides nothing.
export function compileHidden(patterns: readonly HidePattern[]): (path: string) => boolean {
  const compiled = patterns
    .filter((entry) => entry.enabled && validPattern(entry.pattern))
    .map((entry) => new RegExp(entry.pattern))
  if (!compiled.length) return () => false
  return (path) => compiled.some((expression) => expression.test(path))
}
