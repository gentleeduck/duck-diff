import { afterEach, describe, expect, it } from 'bun:test'
import { encodeTarget } from '@duck-diff/protocol'
import { type Fixture, startFixture } from './helpers'

let fixture: Fixture
afterEach(async () => fixture.close())

const unstaged = encodeTarget({ kind: 'unstaged' })

async function edited() {
  fixture = await startFixture((repo) => {
    repo.write('a.txt', 'one\n')
    repo.commit('base')
    repo.write('a.txt', 'two\n')
  })
}

describe('auth', () => {
  it('rejects api calls without the token', async () => {
    await edited()
    const response = await fetch(`http://127.0.0.1:${fixture.server.port}/api/repo`)
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('unauthorized')
  })

  it('serves the page with ?token and sets the cookie', async () => {
    await edited()
    const response = await fetch(`http://127.0.0.1:${fixture.server.port}/?token=${fixture.server.token}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('set-cookie')).toContain(`duck_diff_token=${fixture.server.token}`)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('binds to localhost only', async () => {
    await edited()
    expect(fixture.server.url.startsWith('http://127.0.0.1:')).toBe(true)
  })
})

describe('api', () => {
  it('returns repo info', async () => {
    await edited()
    const info = await (await fixture.get('/api/repo')).json()
    expect(info).toEqual({
      root: fixture.repo.git('rev-parse', '--show-toplevel'),
      branch: 'main',
      head: fixture.repo.git('rev-parse', 'HEAD'),
      nvim: false,
    })
  })

  it('lists files for a target', async () => {
    await edited()
    const files = await (await fixture.get(`/api/files?target=${unstaged}`)).json()
    expect(files.map((f: { path: string }) => f.path)).toEqual(['a.txt'])
  })

  it('streams a patch', async () => {
    await edited()
    const response = await fixture.get(`/api/patch?target=${unstaged}&path=a.txt&status=modified`)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('-one\n+two')
  })

  it('lists refs and commits', async () => {
    await edited()
    const refs = await (await fixture.get('/api/refs')).json()
    expect(refs.map((r: { name: string }) => r.name)).toEqual(['main'])
    const commits = await (await fixture.get('/api/commits?head=main&limit=5')).json()
    expect(commits.map((c: { subject: string }) => c.subject)).toEqual(['base'])
  })

  it('answers 400 for a bad target and an unknown ref', async () => {
    await edited()
    expect((await fixture.get('/api/files?target=garbage')).status).toBe(400)
    const missing = encodeTarget({ kind: 'range', from: 'main', to: 'nope', mode: 'two-dot' })
    const response = await fixture.get(`/api/files?target=${missing}`)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('unknown-ref')
  })

  it('answers 400 for a patch path outside the changed set', async () => {
    await edited()
    const response = await fixture.get(`/api/patch?target=${unstaged}&path=../../etc/passwd&status=modified`)
    expect(response.status).toBe(400)
  })

  it('answers 404 for unknown api paths', async () => {
    await edited()
    expect((await fixture.get('/api/nope')).status).toBe(404)
  })
})
