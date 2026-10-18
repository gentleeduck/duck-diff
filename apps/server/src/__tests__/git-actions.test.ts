import { afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Fixture, startFixture } from './helpers'

let fixture: Fixture
let remote: string
afterEach(async () => {
  await fixture.close()
  rmSync(remote, { recursive: true, force: true })
})

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Duck Test',
    GIT_AUTHOR_EMAIL: 'test@duck.local',
    GIT_COMMITTER_NAME: 'Duck Test',
    GIT_COMMITTER_EMAIL: 'test@duck.local',
  })
})

function send(path: string, body?: unknown) {
  return fetch(`http://127.0.0.1:${fixture.server.port}${path}`, {
    method: 'POST',
    headers: { 'x-duck-diff-token': fixture.server.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function setup() {
  remote = mkdtempSync(join(tmpdir(), 'duck-diff-remote-'))
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  fixture = await startFixture((repo) => {
    repo.write('a.txt', '1\n')
    repo.commit('base')
    repo.git('remote', 'add', 'origin', remote)
  })
}

describe('/api/git', () => {
  it('commits staged changes, pushes, and reports sync status', async () => {
    await setup()
    fixture.repo.write('a.txt', '2\n')
    fixture.repo.git('add', 'a.txt')
    const committed = await send('/api/git/commit', { message: 'second', amend: false })
    expect(committed.status).toBe(200)
    expect((await committed.json()).sha).toBe(fixture.repo.git('rev-parse', 'HEAD'))
    expect(await (await fixture.get('/api/sync')).json()).toEqual({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: 0,
      operation: null,
      incoming: null,
    })
    expect((await send('/api/git/push')).status).toBe(200)
    expect(await (await fixture.get('/api/sync')).json()).toMatchObject({ upstream: 'origin/main' })
  })

  it('switches to a new branch and refuses bad input', async () => {
    await setup()
    expect((await send('/api/git/switch', { branch: 'feat/y', create: true })).status).toBe(200)
    expect(fixture.repo.git('branch', '--show-current')).toBe('feat/y')
    expect((await send('/api/git/switch', { branch: '--evil', create: true })).status).toBe(400)
    expect((await send('/api/git/commit', { message: '  ', amend: false })).status).toBe(400)
    expect((await send('/api/git/nope')).status).toBe(404)
  })

  it('says why a commit failed', async () => {
    await setup()
    const response = await send('/api/git/commit', { message: 'nothing', amend: false })
    expect(response.status).toBe(500)
    expect((await response.json()).error.message).toContain('nothing is staged')
  })
})

describe('everyday git actions', () => {
  it('signs off, undoes a commit, tags, renames, lists remotes, reads blame and the last message', async () => {
    await setup()
    const { repo } = fixture
    repo.write('b.txt', 'b\n')
    repo.git('add', 'b.txt')
    expect((await send('/api/git/commit', { message: 'add b', amend: false, signoff: true })).status).toBe(200)
    const last = await (await fixture.get('/api/last-message')).json()
    expect(last.message).toContain('Signed-off-by:')
    expect((await send('/api/git/undo-commit')).status).toBe(200)
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('b.txt')

    expect((await send('/api/git/tag-create', { name: 'v1', sha: 'HEAD', message: 'first' })).status).toBe(200)
    expect(repo.git('tag').trim()).toBe('v1')
    expect((await send('/api/git/branch-rename', { from: 'main', to: 'trunk' })).status).toBe(200)
    expect(repo.git('branch', '--show-current').trim()).toBe('trunk')

    expect(await (await fixture.get('/api/remotes')).json()).toEqual([{ name: 'origin', url: remote }])
    const blame = await (await fixture.get('/api/blame?path=a.txt')).json()
    expect(blame).toMatchObject([{ summary: 'base', author: 'Duck Test' }])
  })

  it('refuses option-looking names and urls', async () => {
    await setup()
    expect((await send('/api/git/remote-add', { name: 'x', url: '--upload-pack=evil' })).status).toBe(400)
    expect((await send('/api/git/tag-create', { name: '-d', sha: 'HEAD', message: '' })).status).toBe(400)
    expect((await send('/api/git/reset', { sha: 'HEAD', mode: 'nuke' })).status).toBe(400)
  })
})
