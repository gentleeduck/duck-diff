import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPatch, listFiles, splitPatch } from '@duck-diff/git'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'

let repo: TestRepo
let server: RunningServer
let cache: string
afterEach(async () => {
  await server.stop()
  repo.cleanup()
  rmSync(cache, { recursive: true, force: true })
})

async function start() {
  repo = createRepo()
  repo.write('a.txt', 'one\n')
  repo.write('b.txt', 'two\n')
  repo.commit('base')
  repo.write('a.txt', 'ONE\n')
  repo.write('b.txt', 'TWO\n')
  cache = mkdtempSync(join(tmpdir(), 'duck-diff-cache-'))
  server = await createServer({ repo: repo.path, port: 0, watch: false, undoCache: cache })
}

function post(path: string, body?: unknown) {
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: 'POST',
    headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function file(path: string) {
  const found = (await listFiles(repo.path, { kind: 'unstaged' })).find((entry) => entry.path === path)
  if (!found) throw new Error(`no ${path}`)
  return found
}

describe('/api/write', () => {
  it('stages a hunk by index and header', async () => {
    await start()
    const target = await file('a.txt')
    const [hunk = ''] = splitPatch(await getPatch(repo.path, { kind: 'unstaged' }, target)).hunks
    const response = await post('/api/write', {
      action: 'stage-hunk',
      file: target,
      hunkIndex: 0,
      hunkHeader: hunk.slice(0, hunk.indexOf('\n')),
    })
    expect(response.status).toBe(204)
    expect(repo.git('diff', '--cached', '--name-only')).toBe('a.txt')
  })

  it('answers 409 for a stale file', async () => {
    await start()
    const target = await file('a.txt')
    repo.write('a.txt', 'changed again\n')
    const response = await post('/api/write', { action: 'stage-file', file: target })
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('stale')
  })

  it('runs concurrent writes one after another', async () => {
    await start()
    const [a, b] = await Promise.all([file('a.txt'), file('b.txt')])
    const responses = await Promise.all([
      post('/api/write', { action: 'stage-file', file: a }),
      post('/api/write', { action: 'stage-file', file: b }),
    ])
    expect(responses.map((r) => r.status)).toEqual([204, 204])
    expect(repo.git('diff', '--cached', '--name-only')).toBe('a.txt\nb.txt')
  })

  it('refuses paths outside the repo', async () => {
    await start()
    const response = await post('/api/write', {
      action: 'discard-file',
      file: { path: '../x', oldPath: null, status: 'modified', newSha: null },
    })
    expect(response.status).toBe(400)
  })
})

describe('/api/undo', () => {
  it('brings back a discarded file', async () => {
    await start()
    expect((await post('/api/write', { action: 'discard-file', file: await file('a.txt') })).status).toBe(204)
    expect(repo.git('diff', '--name-only')).toBe('b.txt')
    const undone = await post('/api/undo')
    expect(await undone.json()).toEqual({ restored: ['a.txt'] })
    expect(repo.git('diff', '--name-only')).toBe('a.txt\nb.txt')
    expect(await (await post('/api/undo')).json()).toEqual({ restored: null })
  })
})
