import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo
let server: RunningServer
afterEach(async () => {
  await server.stop()
  repo.cleanup()
})

function post(body: unknown) {
  return fetch(`http://127.0.0.1:${server.port}/api/open`, {
    method: 'POST',
    headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/open', () => {
  it('starts a code editor when there is no Neovim', async () => {
    repo = createRepo()
    server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      pickOpener: () => ({ how: 'editor', command: 'true', args: (file, line) => [`${file}:${line}`] }),
    })
    expect(await (await post({ path: 'a.ts', line: 3 })).json()).toEqual({ how: 'editor', command: 'true' })
  })

  it('sends the open keys to Neovim for paths inside the repo', async () => {
    repo = createRepo()
    const calls: string[][] = []
    server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      nvim: '/tmp/nvim.sock',
      runNvim: async (args) => {
        calls.push(args)
      },
    })
    expect(await (await post({ path: 'src/a.ts', line: 3 })).json()).toEqual({ how: 'nvim' })
    expect(calls[0]).toEqual([
      '--server',
      '/tmp/nvim.sock',
      '--remote-send',
      `<C-\\><C-n>:edit +3 ${server.repo}/src/a.ts<CR>`,
    ])
    expect((await post({ path: '../etc/passwd', line: 1 })).status).toBe(400)
  })

  it('reports nvim in repo info', async () => {
    repo = createRepo()
    server = await createServer({ repo: repo.path, port: testPort(), watch: false, nvim: '/tmp/nvim.sock' })
    const info = await (
      await fetch(`http://127.0.0.1:${server.port}/api/repo`, { headers: { 'x-duck-diff-token': server.token } })
    ).json()
    expect(info.nvim).toBe(true)
  })
})
