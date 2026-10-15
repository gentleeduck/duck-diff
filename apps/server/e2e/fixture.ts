import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { test as base, expect } from '@playwright/test'

const BINARY = new URL('../dist/duck-diff', import.meta.url).pathname

interface Fixtures {
  repo: TestRepo
  app: { url: string }
}

// Each test gets a fresh repo with one committed file edited and one untracked file, served by the real binary.
export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this destructuring.
  repo: async ({}, use) => {
    const repo = createRepo()
    repo.write('src/app.ts', 'export const answer = 41\nexport const name = "duck"\n')
    repo.write('README.md', '# demo\n')
    repo.commit('base')
    repo.write('src/app.ts', 'export const answer = 42\nexport const name = "duck"\n')
    repo.write('notes.txt', 'fresh file\n')
    await use(repo)
    repo.cleanup()
  },
  app: async ({ repo }, use) => {
    // Comments and undo snapshots go to a throwaway home so tests never touch the real ones.
    const home = mkdtempSync(join(tmpdir(), 'duck-diff-e2e-'))
    // CI machines have no git identity, so commits made from the page need one.
    const env = {
      ...process.env,
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CACHE_HOME: join(home, 'cache'),
      // A plain shell in the page's terminals, so the user's prompt and plugins never slow a test.
      SHELL: '/bin/sh',
      GIT_AUTHOR_NAME: 'Duck Test',
      GIT_AUTHOR_EMAIL: 'test@duck.local',
      GIT_COMMITTER_NAME: 'Duck Test',
      GIT_COMMITTER_EMAIL: 'test@duck.local',
    }
    const child = spawn(BINARY, ['serve', '--repo', repo.path], { stdio: ['pipe', 'pipe', 'inherit'], env })
    const [chunk] = (await once(child.stdout, 'data')) as [Buffer]
    const handshake = HandshakeSchema.parse(JSON.parse(chunk.toString().split('\n')[0] ?? ''))
    await use({ url: handshake.url })
    // Wait for the exit so the repo is not deleted under a git command still running.
    const exited = once(child, 'exit')
    child.kill()
    await exited
    rmSync(home, { recursive: true, force: true })
  },
})

export { expect }
