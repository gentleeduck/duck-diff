// Test files by the common conventions: test folders, and *.test / *.spec / *_test / test_* names.
const FOLDER = /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|testdata|fixtures)\//
const NAME = /(\.(test|spec|e2e|bench)\.[^/]+$)|(_test\.[^/]+$)|(^|\/)test_[^/]+\.py$/

export function isTestFile(path: string): boolean {
  return FOLDER.test(path) || NAME.test(path)
}
