import { afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo
let server: RunningServer
let outside: string
const opened: string[] = []
const pages: string[] = []
const nvimCalls: string[][] = []
afterEach(async () => {
  await server.stop()
  repo.cleanup()
  rmSync(outside, { recursive: true, force: true })
  opened.length = 0
  pages.length = 0
  nvimCalls.length = 0
})
beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Duck Test',
    GIT_AUTHOR_EMAIL: 'test@duck.local',
    GIT_COMMITTER_NAME: 'Duck Test',
    GIT_COMMITTER_EMAIL: 'test@duck.local',
  })
})

async function start(nvim: string | null = null) {
  repo = createRepo()
  repo.write('a.txt', 'a\n')
  repo.commit('base')
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'duck-diff-wt-')))
  server = await createServer({
    repo: repo.path,
    port: testPort(),
    watch: false,
    nvim,
    runNvim: async (args) => {
      nvimCalls.push(args)
    },
    startSibling: async (path) => {
      opened.push(path)
      return { url: `http://127.0.0.1:1/?token=${opened.length}`, child: null }
    },
    openPage: async (url) => {
      pages.push(url)
      return true
    },
  })
}

const call = (path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('worktree routes', () => {
  it('adds a worktree, lists it, opens it in its own server and in Neovim, then removes it', async () => {
    await start('/tmp/nvim.sock')
    const path = join(outside, 'feature')
    expect((await call('/api/git/worktree-add', { path, branch: 'feature', create: true })).status).toBe(200)
    const trees = await (await call('/api/worktrees')).json()
    expect(trees.map((tree: { branch: string }) => tree.branch)).toEqual(['main', 'feature'])

    expect(await (await call('/api/open-repo', { path })).json()).toEqual({
      url: 'http://127.0.0.1:1/?token=1',
      opened: true,
    })
    expect(pages).toEqual(['http://127.0.0.1:1/?token=1'])
    expect(opened).toEqual([path])
    expect((await call('/api/open-repo', { path: outside })).status).toBe(404)
    expect((await call('/api/open-repo', { path: 'relative/path' })).status).toBe(400)

    expect((await call('/api/nvim/tcd', { path })).status).toBe(204)
    expect(nvimCalls[0]).toEqual(['--server', '/tmp/nvim.sock', '--remote-send', `<C-\\><C-n>:tcd ${path}<CR>`])

    expect((await call('/api/git/worktree-remove', { path, force: false })).status).toBe(200)
    expect((await (await call('/api/worktrees')).json()).length).toBe(1)
  })

  it('lists no submodules in a repo without them', async () => {
    await start()
    expect(await (await call('/api/submodules')).json()).toEqual([])
    expect((await call('/api/nvim/tcd', { path: repo.path })).status).toBe(409)
  })
})
