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
