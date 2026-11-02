import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoId } from '@duck-diff/git'
import type { DiffTarget, ReviewComment, ReviewOverview } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { createServer, type RunningServer } from '../server'
import { testPort } from './helpers'

let repo: TestRepo
let server: RunningServer
let data: string
afterEach(async () => {
  await server?.stop()
  repo.cleanup()
  rmSync(data, { recursive: true, force: true })
})

async function start() {
  server = await createServer({ repo: repo.path, port: testPort(), watch: false, dataDir: data })
}

// main with one commit, and feat one commit ahead of it, checked out.
async function setup() {
  repo = createRepo()
  repo.write('a.txt', 'one\n')
  repo.commit('base')
  repo.git('switch', '-q', '-c', 'feat')
  repo.write('a.txt', 'one\ntwo\n')
  repo.commit('two')
  data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
  await start()
}

function call(method: string, path: string, body?: unknown) {
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    method,
    headers: { 'x-duck-diff-token': server.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const comment = (target: DiffTarget, body = 'needs a test') =>
  call('POST', '/api/reviews', { target, path: 'a.txt', side: 'additions', line: 2, lineHash: 'h', body }).then(
    (response) => response.json() as Promise<ReviewComment>,
  )
const list = async (target: DiffTarget) =>
  (
    (await (
      await call('GET', `/api/reviews?target=${encodeURIComponent(JSON.stringify(target))}`)
    ).json()) as ReviewComment[]
  ).map((entry) => entry.body)
const overview = async () => (await (await call('GET', '/api/reviews/overview')).json()) as ReviewOverview

const UNSTAGED: DiffTarget = { kind: 'unstaged' }
const LOCAL: DiffTarget = { kind: 'local' }
const AHEAD_OF_MAIN: DiffTarget = { kind: 'range', from: 'main', to: 'HEAD', mode: 'merge-base' }

describe('comments belong to the branch they were written on', () => {
  it('keeps working tree comments on their branch', async () => {
    await setup()
    await comment(UNSTAGED, 'on feat')
    await comment(LOCAL, 'local on feat')
    repo.git('switch', '-q', 'main')
    expect(await list(UNSTAGED)).toEqual([])
    expect(await list(LOCAL)).toEqual([])
    await comment(UNSTAGED, 'on main')
    repo.git('switch', '-q', 'feat')
    expect(await list(UNSTAGED)).toEqual(['on feat'])
    expect(await list(LOCAL)).toEqual(['local on feat'])
  })

  it('reads HEAD in a range as the branch, so the same comparison by name shows the same comments', async () => {
    await setup()
    await comment(AHEAD_OF_MAIN, 'feat adds this')
    expect(await list({ kind: 'range', from: 'main', to: 'feat', mode: 'merge-base' })).toEqual(['feat adds this'])
    repo.git('switch', '-q', '-c', 'other', 'main')
    expect(await list(AHEAD_OF_MAIN)).toEqual([])
  })

  it('pins a comment on commit HEAD to that commit, whatever HEAD becomes', async () => {
    await setup()
    const sha = repo.git('rev-parse', 'HEAD')
    const made = await comment({ kind: 'commit', sha: 'HEAD' }, 'on two')
    expect(made.target).toEqual({ kind: 'commit', sha })
    repo.write('b.txt', 'b\n')
    repo.commit('three')
    expect(await list({ kind: 'commit', sha: 'HEAD' })).toEqual([])
    expect(await list({ kind: 'commit', sha })).toEqual(['on two'])
    expect(await list({ kind: 'commit', sha: sha.slice(0, 7) })).toEqual(['on two'])
  })

  it('keeps comments made on a detached HEAD with that commit', async () => {
    await setup()
    repo.git('switch', '-q', '--detach', 'HEAD')
    await comment(UNSTAGED, 'detached')
    repo.git('switch', '-q', 'main')
    expect(await list(UNSTAGED)).toEqual([])
    repo.git('switch', '-q', '--detach', 'feat')
    expect(await list(UNSTAGED)).toEqual(['detached'])
    expect((await overview()).orphaned).toEqual([])
  })

  it('counts each branch comments, for the delete confirmation', async () => {
    await setup()
    await comment(UNSTAGED)
    await comment(AHEAD_OF_MAIN)
    repo.git('switch', '-q', 'main')
    await comment(UNSTAGED)
    expect((await overview()).counts).toEqual({ feat: 2, main: 1 })
  })

  it('counts a branch named like an object property', async () => {
    await setup()
    repo.git('switch', '-q', '-c', 'constructor')
    await comment(UNSTAGED)
    expect((await overview()).counts).toEqual({ constructor: 1 })
  })
})

describe('when a branch goes away', () => {
  it('deletes its comments along with it when deleted from duck-diff', async () => {
    await setup()
    await comment(UNSTAGED)
    await comment(AHEAD_OF_MAIN)
    repo.git('switch', '-q', 'main')
    await comment(UNSTAGED, 'stays on main')
    expect((await call('POST', '/api/git/branch-delete', { name: 'feat', force: true })).status).toBe(200)
    expect((await overview()).orphaned).toEqual([])
    repo.git('switch', '-q', '-c', 'feat')
    expect(await list(UNSTAGED)).toEqual([])
    repo.git('switch', '-q', 'main')
    expect(await list(UNSTAGED)).toEqual(['stays on main'])
  })

  it('takes its comments along when renamed from duck-diff', async () => {
    await setup()
    await comment(UNSTAGED, 'working tree')
    await comment(AHEAD_OF_MAIN, 'range')
    expect((await call('POST', '/api/git/branch-rename', { from: 'feat', to: 'renamed' })).status).toBe(200)
    expect(await list(UNSTAGED)).toEqual(['working tree'])
    expect(await list(AHEAD_OF_MAIN)).toEqual(['range'])
    expect((await overview()).counts).toEqual({ renamed: 2 })
  })

  it('renames it where a comparison only compares with it', async () => {
    await setup()
    repo.git('switch', '-q', 'main')
    await comment({ kind: 'range', from: 'feat', to: 'main', mode: 'merge-base' }, 'range')
    await comment({ kind: 'local', base: 'feat' }, 'base')
    expect((await call('POST', '/api/git/branch-rename', { from: 'feat', to: 'renamed' })).status).toBe(200)
    expect(await list({ kind: 'range', from: 'renamed', to: 'main', mode: 'merge-base' })).toEqual(['range'])
    expect(await list({ kind: 'local', base: 'renamed' })).toEqual(['base'])
  })

  it('moves the working tree comments to a branch created from duck-diff, with the edits', async () => {
    await setup()
    await comment(UNSTAGED, 'working tree')
    await comment(AHEAD_OF_MAIN, 'range')
    expect((await call('POST', '/api/git/switch', { branch: 'next', create: true })).status).toBe(200)
    expect(await list(UNSTAGED)).toEqual(['working tree'])
    expect(await list(AHEAD_OF_MAIN)).toEqual([])
    repo.git('switch', '-q', 'feat')
    expect(await list(UNSTAGED)).toEqual([])
    expect(await list(AHEAD_OF_MAIN)).toEqual(['range'])
  })

  it('orphans its comments when deleted outside duck-diff, and brings them back when it returns', async () => {
    await setup()
    const sha = repo.git('rev-parse', 'HEAD')
    const made = await comment(UNSTAGED, 'kept')
    repo.git('switch', '-q', 'main')
    repo.git('branch', '-D', 'feat')
    expect((await overview()).orphaned).toEqual([{ ...made, missing: ['feat'] }])
    expect((await overview()).counts).toEqual({})
    repo.git('branch', 'feat', sha)
    expect((await overview()).orphaned).toEqual([])
  })

  it('moves orphaned comments to the current branch', async () => {
    await setup()
    const made = await comment(AHEAD_OF_MAIN, 'moved')
    repo.git('switch', '-q', '-c', 'next')
    repo.git('branch', '-D', 'feat')
    expect((await call('POST', '/api/reviews/adopt', { ids: [made.id] })).status).toBe(204)
    expect((await overview()).orphaned).toEqual([])
    expect(await list(AHEAD_OF_MAIN)).toEqual(['moved'])
  })

  it('clears the orphaned comments asked for, and only those', async () => {
    await setup()
    const gone = await comment(UNSTAGED, 'gone')
    const kept = await comment(AHEAD_OF_MAIN, 'not asked for')
    repo.git('switch', '-q', 'main')
    const stays = await comment(UNSTAGED, 'stays')
    repo.git('branch', '-D', 'feat')
    expect((await call('DELETE', '/api/reviews/orphaned', { ids: [gone.id, stays.id] })).status).toBe(204)
    expect((await overview()).orphaned.map((entry) => entry.id)).toEqual([kept.id])
    expect(await list(UNSTAGED)).toEqual(['stays'])
  })

  it('does not orphan comments on the unborn branch of an empty repo', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    await start()
    await comment(LOCAL, 'first')
    expect((await overview()).orphaned).toEqual([])
    expect(await list(LOCAL)).toEqual(['first'])
  })
})

describe('comments written before they were kept per branch', () => {
  it('go to the branch checked out when this version first reads them', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('base')
    repo.git('switch', '-q', '-c', 'feat')
    data = mkdtempSync(join(tmpdir(), 'duck-diff-data-'))
    const file = join(data, repoId(repo.path), 'reviews.json')
    mkdirSync(join(data, repoId(repo.path)), { recursive: true })
    const old = { target: UNSTAGED, path: 'a.txt', side: 'additions', line: 1, lineHash: 'h', body: 'old' }
    writeFileSync(file, JSON.stringify([{ ...old, id: 'x', createdAt: 1, updatedAt: 1 }]))
    await start()
    expect(await list(UNSTAGED)).toEqual(['old'])
    repo.git('switch', '-q', 'main')
    expect(await list(UNSTAGED)).toEqual([])
    expect(JSON.parse(readFileSync(file, 'utf8'))[0]).toMatchObject({ on: 'feat', branches: ['feat'] })
  })
})
