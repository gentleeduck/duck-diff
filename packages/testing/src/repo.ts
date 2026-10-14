import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface TestRepo {
  path: string
  write(rel: string, content: string | Uint8Array): void
  remove(rel: string): void
  git(...args: string[]): string
  commit(message: string): string
  cleanup(): void
}

// A fixed identity and date keep shas stable across machines and runs.
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Duck Test',
  GIT_AUTHOR_EMAIL: 'test@duck.local',
  GIT_COMMITTER_NAME: 'Duck Test',
  GIT_COMMITTER_EMAIL: 'test@duck.local',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  LC_ALL: 'C',
}

export function createRepo(): TestRepo {
  const path = mkdtempSync(join(tmpdir(), 'duck-diff-'))
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: path, env: ENV, encoding: 'utf8' }).replace(/\n$/, '')

  git('init', '-q', '-b', 'main')

  return {
    path,
    git,
    write(rel, content) {
      const file = join(path, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
    },
    remove(rel) {
      rmSync(join(path, rel), { force: true })
    },
    commit(message) {
      git('add', '-A')
      git('commit', '-q', '--allow-empty', '-m', message)
      return git('rev-parse', 'HEAD')
    },
    cleanup() {
      rmSync(path, { recursive: true, force: true })
    },
  }
}
