import { homedir } from 'node:os'
import { join } from 'node:path'

// Everything duck-diff keeps (settings, comments, the repo list, caches, undo snapshots) lives in one folder, as
// Claude keeps ~/.claude. DUCK_DIFF_HOME moves it, for tests or a second profile.
export function duckHome(): string {
  return process.env.DUCK_DIFF_HOME || join(homedir(), '.duck-diff')
}
