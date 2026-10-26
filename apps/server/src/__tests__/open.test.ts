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

  it('says so when the editor cannot be started, instead of answering that it opened', async () => {
    repo = createRepo()
    server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      pickOpener: () => ({ how: 'system', command: 'duck-diff-no-such-opener', args: (file) => [file] }),
    })
    const response = await post({ path: 'a.ts', line: 1 })
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).toContain('duck-diff-no-such-opener')
  })

  it('opens with the editor the page asks for, and says when it is not there', async () => {
    repo = createRepo()
    const asked: unknown[] = []
    server = await createServer({
      repo: repo.path,
      port: testPort(),
      watch: false,
      pickOpener: ({ prefer }) => {
        asked.push(prefer)
        if (prefer === 'zed') throw new Error('zed is not on the PATH')
        return { how: 'editor', command: 'true', args: (file, line) => [`${file}:${line}`] }
      },
    })
    expect((await post({ path: 'a.ts', line: 3, editor: 'cursor' })).status).toBe(200)
    expect((await post({ path: 'a.ts', line: 3 })).status).toBe(200)
    expect(asked).toEqual(['cursor', 'auto'])
    const missing = await post({ path: 'a.ts', line: 3, editor: 'zed' })
    expect(missing.status).toBe(409)
    expect(JSON.stringify(await missing.json())).toContain('zed is not on the PATH')
    expect((await post({ path: 'a.ts', line: 3, editor: 'ed; rm -rf /' })).status).toBe(400)
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
