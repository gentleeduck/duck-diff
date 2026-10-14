import { spawn } from 'node:child_process'
import { once } from 'node:events'
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
    const child = spawn(BINARY, ['serve', '--repo', repo.path], { stdio: ['pipe', 'pipe', 'inherit'] })
    const [chunk] = (await once(child.stdout, 'data')) as [Buffer]
    const handshake = HandshakeSchema.parse(JSON.parse(chunk.toString().split('\n')[0] ?? ''))
    await use({ url: handshake.url })
    child.kill()
  },
})

export { expect }
