import { afterEach, describe, expect, it } from 'bun:test'
import { type Fixture, startFixture } from './helpers'

let fixture: Fixture
afterEach(() => fixture.close())

async function conflicted() {
  fixture = await startFixture((repo) => {
    repo.write('a.txt', 'one\ntwo\n')
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'feature')
    repo.write('a.txt', 'one\nfeature\n')
    repo.commit('feature')
    repo.git('checkout', '-q', 'main')
    repo.write('a.txt', 'one\nmain\n')
    repo.commit('main')
    try {
      repo.git('merge', 'feature')
    } catch {}
  })
}

function send(path: string, body: unknown) {
  return fetch(`http://127.0.0.1:${fixture.server.port}${path}`, {
    method: 'POST',
    headers: { 'x-duck-diff-token': fixture.server.token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('conflict routes', () => {
  it('reads a conflicted file as blocks and stages', async () => {
    await conflicted()
    const response = await fixture.get('/api/conflict?path=a.txt')
    expect(response.status).toBe(200)
    const file = await response.json()
    expect(file.segments[1]).toMatchObject({ kind: 'conflict', ours: ['main'], theirs: ['feature'] })
    expect(file.stages.theirs).toBe('one\nfeature\n')
  })

  it('writes a merged text, stages it, and refuses paths outside the repo', async () => {
    await conflicted()
    const ok = await send('/api/git/resolve-text', { path: 'a.txt', text: 'one\nmain\nfeature\n' })
    expect(ok.status).toBe(200)
    expect(fixture.repo.git('ls-files', '-u')).toBe('')
    expect(fixture.repo.git('show', ':a.txt')).toBe('one\nmain\nfeature')
    expect((await send('/api/git/resolve-text', { path: '../x', text: '' })).status).toBe(400)
    expect((await fixture.get('/api/conflict?path=a.txt')).status).toBeGreaterThanOrEqual(400)
  })
})
