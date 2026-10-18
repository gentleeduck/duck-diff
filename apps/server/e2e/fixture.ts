import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { type BrowserContext, test as base, expect, type Page } from '@playwright/test'

export const BINARY = new URL('../dist/duck-diff', import.meta.url).pathname

interface Fixtures {
  repo: TestRepo
  // opened: where the stand-in editor writes the arguments it was started with; browsed: the pages the server
  // opened through the stand-in browser, one url a line; env: what the server runs with, for running git (and
  // duck-diff through it) the same way.
  app: { url: string; opened: string; browsed: string; env: Record<string, string | undefined> }
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
    // A stand-in VS Code first on the PATH: Open starts it, and a test reads what it was given.
    const opened = join(home, 'opened.txt')
    mkdirSync(join(home, 'bin'))
    writeFileSync(join(home, 'bin', 'code'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${opened}'\n`)
    chmodSync(join(home, 'bin', 'code'), 0o755)
    const browsed = join(home, 'browsed.txt')
    writeFileSync(join(home, 'bin', 'browser'), `#!/bin/sh\nprintf '%s\\n' "$1" >> '${browsed}'\n`)
    chmodSync(join(home, 'bin', 'browser'), 0o755)
    // CI machines have no git identity, so commits made from the page need one.
    const env = {
      ...process.env,
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CACHE_HOME: join(home, 'cache'),
      DUCK_DIFF_HOME: join(home, 'duck-diff'),
      // The test shells' commands stay out of the user's own history.
      HISTFILE: '/dev/null',
      PATH: `${join(home, 'bin')}:${process.env.PATH}`,
      BROWSER: join(home, 'bin', 'browser'),
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
    await use({ url: handshake.url, opened, browsed, env })
    // Wait for the exit so the repo is not deleted under a git command still running.
    const exited = once(child, 'exit')
    child.kill()
    await exited
    // Something the server started can still be writing into home after it exits. The folder is throwaway,
    // so one that will not go is reported with what is left in it, not failed on.
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    } catch (error) {
      const left = readdirSync(home, { recursive: true }).slice(0, 20).join(', ')
      console.warn(`left ${home} behind (${(error as Error).message}): ${left}`)
    }
  },
})

// The page the server opened last (another checkout's), visited in a new tab the way a browser would.
export async function openedPage(context: BrowserContext, browsed: string): Promise<Page> {
  const last = () => {
    try {
      return readFileSync(browsed, 'utf8').trim().split('\n').at(-1) ?? ''
    } catch {
      return ''
    }
  }
  await expect.poll(last).not.toBe('')
  const tab = await context.newPage()
  await tab.goto(last())
  return tab
}

export { expect }
