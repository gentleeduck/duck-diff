import { afterEach, beforeAll, describe, expect, it } from 'bun:test'
import { type Fixture, startFixture } from './helpers'

let fixture: Fixture
afterEach(() => fixture.close())
beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Duck Test',
    GIT_AUTHOR_EMAIL: 'test@duck.local',
    GIT_COMMITTER_NAME: 'Duck Test',
    GIT_COMMITTER_EMAIL: 'test@duck.local',
  })
})

const send = (path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${fixture.server.port}${path}`, {
    method: 'POST',
    headers: { 'x-duck-diff-token': fixture.server.token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('history routes', () => {
  it('lists a rebase plan, runs it, and reports bisect state', async () => {
    let base = ''
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'a\n')
      base = repo.commit('base')
      repo.write('b.txt', 'b\n')
      repo.commit('add b')
      repo.write('c.txt', 'c\n')
      repo.commit('add c')
    })
    const plan = await (await fixture.get(`/api/rebase-plan?base=${base}`)).json()
    expect(plan.map((commit: { subject: string }) => commit.subject)).toEqual(['add b', 'add c'])
    const [b, c] = plan.map((commit: { sha: string }) => commit.sha)
    const done = await send('/api/git/rebase-interactive', {
      base,
      steps: [
        { sha: c, action: 'pick' },
        { sha: b, action: 'squash' },
      ],
    })
    expect(await done.json()).toEqual({ conflicts: false, stopped: false })
    expect(fixture.repo.git('log', '--format=%s')).toBe('add c\nbase')
    // A plan naming anything but the commits after the base is refused before git runs.
    const stranger = { base, steps: [{ sha: 'nope;rm', action: 'pick' }] }
    expect((await send('/api/git/rebase-interactive', stranger)).status).toBe(409)
    expect((await send('/api/git/rebase-interactive', { base: '--exec=x', steps: [] })).status).toBe(400)

    expect(await (await fixture.get('/api/bisect')).json()).toMatchObject({ active: false })
    expect((await send('/api/git/bisect-mark', { kind: 'bad' })).status).toBe(200)
    expect(await (await fixture.get('/api/bisect')).json()).toMatchObject({ active: true })
    expect((await send('/api/git/bisect-reset')).status).toBe(200)
  })
})
