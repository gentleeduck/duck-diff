import { afterEach, describe, expect, it } from 'bun:test'
import { encodeTarget, lastTargetKey, type ResolvedRevision } from '@duck-diff/protocol'
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
    expect(response.headers.get('set-cookie')).toContain(
      `duck_diff_token_${fixture.server.port}=${fixture.server.token}`,
    )
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('keeps the page state on the server and hands it to the page with the html', async () => {
    await edited()
    const base = `http://127.0.0.1:${fixture.server.port}`
    const headers = { 'x-duck-diff-token': fixture.server.token }
    const put = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ changes: { 'duck-diff:settings': '{"fontSize":16}' } }),
    })
    expect(put.status).toBe(204)
    expect(await (await fetch(`${base}/api/state`, { headers })).json()).toEqual({
      'duck-diff:settings': '{"fontSize":16}',
    })
    const html = await (await fetch(`${base}/?token=${fixture.server.token}`)).text()
    expect(html).toContain('<script id="duck-diff-state" type="application/json">{"duck-diff:settings"')
    await fetch(`${base}/api/state/queries`, { method: 'PUT', headers, body: '{"q":1}' })
    // The saved answers come back inside the page, not through a request of their own.
    const again = await (await fetch(`${base}/?token=${fixture.server.token}`)).text()
    expect(again).toContain('<script id="duck-diff-queries" type="application/json">{"q":1}</script>')
  })

  it('opens a page that names no comparison on the one last chosen in its repo, and keeps a named one', async () => {
    await edited()
    const base = `http://127.0.0.1:${fixture.server.port}`
    const headers = { 'x-duck-diff-token': fixture.server.token }
    const { root } = (await (await fetch(`${base}/api/repo`, { headers })).json()) as { root: string }
    const range = JSON.stringify({ kind: 'range', from: 'HEAD~1', to: 'HEAD', mode: 'merge-base' })
    await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ changes: { [lastTargetKey(root)]: range } }),
    })
    const opened = await fetch(`${base}/changes?token=${fixture.server.token}`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    const next = new URL(opened.headers.get('location') ?? '', base)
    expect(next.pathname).toBe('/changes')
    expect(next.searchParams.get('target')).toBe(range)
    expect(next.searchParams.get('token')).toBe(fixture.server.token)
    const named = await fetch(
      `${base}/changes?token=${fixture.server.token}&target=${encodeURIComponent('{"kind":"staged"}')}`,
      { redirect: 'manual' },
    )
    expect(named.status).toBe(200)
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

  it('says what commit a typed revision is, spaces and carets included', async () => {
    await edited()
    const get = async (rev: string) =>
      (await fixture.get(`/api/resolve?${new URLSearchParams({ rev })}`)).json() as Promise<ResolvedRevision>
    expect(await get(':/base')).toMatchObject({ kind: 'commit', subject: 'base' })
    expect(await get('^HEAD')).toMatchObject({ kind: 'unknown' })
    expect(await get('nope')).toEqual({ kind: 'unknown', reason: 'git knows no commit called nope here' })
    expect((await fixture.get('/api/resolve?rev=')).status).toBe(400)
  })

  it('lists the commits that touched one file and refuses paths outside the repo', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'one\n')
      repo.commit('base')
      repo.write('b.txt', 'other\n')
      repo.commit('only b')
    })
    const commits = await (await fixture.get('/api/commits?head=main&path=a.txt')).json()
    expect(commits.map((c: { subject: string }) => c.subject)).toEqual(['base'])
    expect((await fixture.get('/api/commits?head=main&path=../x')).status).toBe(400)
    // A ref is never read as one of git's options.
    expect((await fixture.get('/api/commits?head=--output=x')).status).toBe(400)
    expect((await fixture.get('/api/commits?head=main&base=-p')).status).toBe(400)
  })

  it('streams the commit graph with parents and ref names', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'one\n')
      repo.commit('base')
      repo.commit('second')
    })
    const text = await (await fixture.get('/api/graph?limit=10')).text()
    const records = text.split('\x1e').filter((record) => record.trim())
    expect(records).toHaveLength(2)
    expect(records[0]).toContain('HEAD -> main')
    expect((await fixture.get('/api/graph?limit=0')).status).toBe(400)
  })

  it('lists the file tree and reads files, refusing paths outside the repo', async () => {
    fixture = await startFixture((repo) => {
      repo.write('src/a.ts', 'one\n')
      repo.commit('base')
      repo.write('src/a.ts', 'two\n')
    })
    expect(await (await fixture.get('/api/tree')).json()).toEqual(['src/a.ts'])
    expect(await (await fixture.get('/api/file?path=src/a.ts')).json()).toMatchObject({ text: 'two\n' })
    expect(await (await fixture.get('/api/file?ref=HEAD&path=src/a.ts')).json()).toMatchObject({ text: 'one\n' })
    expect((await fixture.get('/api/file?path=../etc/passwd')).status).toBe(400)
    expect((await fixture.get('/api/file?path=nope.ts')).status).toBe(404)
  })

  it('finds where a name is defined and used, now or at a commit, and refuses non-names', async () => {
    fixture = await startFixture((repo) => {
      repo.write('src/a.ts', 'export const answer = 41\n')
      repo.commit('base')
      repo.write('src/b.ts', "import { answer } from './a'\nlog(answer)\n")
    })
    const now = await (await fixture.get('/api/symbols?name=answer')).json()
    expect(now.hits.map((hit: { path: string; kind: string }) => `${hit.path}:${hit.kind}`)).toEqual([
      'src/a.ts:definition',
      'src/b.ts:import',
      'src/b.ts:reference',
    ])
    const then = await (await fixture.get('/api/symbols?name=answer&ref=HEAD')).json()
    expect(then.hits).toHaveLength(1)
    expect((await fixture.get('/api/symbols?name=rm%20-rf')).status).toBe(400)
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

describe('/api/raw', () => {
  it('serves repository images with locked-down headers and refuses other files', async () => {
    const { startFixture } = await import('./helpers')
    const fixture = await startFixture((repo) => {
      repo.write('logo.png', new Uint8Array([137, 80, 78, 71]))
      repo.write('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
      repo.write('secret.txt', 'no')
    })
    try {
      const png = await fixture.get('/api/raw?path=logo.png')
      expect(png.status).toBe(200)
      expect(png.headers.get('content-type')).toBe('image/png')
      expect([...new Uint8Array(await png.arrayBuffer())]).toEqual([137, 80, 78, 71])
      const svg = await fixture.get('/api/raw?path=logo.svg')
      expect(svg.headers.get('content-security-policy')).toContain('sandbox')
      expect((await fixture.get('/api/raw?path=secret.txt')).status).toBe(415)
      expect((await fixture.get('/api/raw?path=missing.png')).status).toBe(404)
      expect((await fixture.get('/api/raw?path=../x.png')).status).toBe(400)
    } finally {
      await fixture.close()
    }
  })
})
