import { afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Servers made in tests remember their repos, comments and caches; that goes to a throwaway folder, never
// the user's own list. Bun.spawn does not see these changes, so a test that spawns passes process.env.
const data = mkdtempSync(join(tmpdir(), 'duck-diff-test-data-'))
process.env.XDG_DATA_HOME = data
// A plain shell in test terminals: the user's own reads XDG_DATA_HOME and would set itself up there first.
process.env.SHELL = '/bin/sh'
afterAll(() => rmSync(data, { recursive: true, force: true }))
