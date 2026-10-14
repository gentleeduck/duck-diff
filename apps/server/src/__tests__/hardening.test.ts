import { afterEach, describe, expect, it } from 'bun:test'
import { encodeTarget } from '@duck-diff/protocol'
import { type Fixture, startFixture } from './helpers'

let fixture: Fixture
afterEach(async () => fixture.close())

const unstaged = encodeTarget({ kind: 'unstaged' })
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function post(path: string, body: unknown) {
  return fetch(`http://127.0.0.1:${fixture.server.port}${path}`, {
    method: 'POST',
    headers: { 'x-duck-diff-token': fixture.server.token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/blob', () => {
  it('serves both sides of a changed image with its type', async () => {
    fixture = await startFixture((repo) => {
      repo.write('logo.png', PNG.slice(0, 9))
      repo.commit('base')
      repo.write('logo.png', PNG)
    })
    const old = await fixture.get(`/api/blob?target=${unstaged}&side=old&path=logo.png`)
    expect(old.headers.get('content-type')).toBe('image/png')
    expect(old.headers.get('content-security-policy')).toContain('sandbox')
    expect(new Uint8Array(await old.arrayBuffer())).toEqual(PNG.slice(0, 9))
    const now = await fixture.get(`/api/blob?target=${unstaged}&side=new&path=logo.png`)
    expect(new Uint8Array(await now.arrayBuffer())).toEqual(PNG)
  })

  it('refuses files that are not images or not in the diff', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'one\n')
      repo.write('logo.png', PNG)
      repo.commit('base')
      repo.write('a.txt', 'two\n')
    })
    expect((await fixture.get(`/api/blob?target=${unstaged}&side=new&path=a.txt`)).status).toBe(400)
    expect((await fixture.get(`/api/blob?target=${unstaged}&side=new&path=logo.png`)).status).toBe(400)
  })
})

describe('writes on a conflicted file', () => {
  it('answers 409 and leaves the index alone', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'one\n')
      repo.commit('base')
      repo.git('switch', '-q', '-c', 'other')
      repo.write('a.txt', 'two\n')
      repo.commit('other')
      repo.git('switch', '-q', 'main')
      repo.write('a.txt', 'three\n')
      repo.commit('main')
      try {
        repo.git('merge', '-q', 'other')
      } catch {
        // The conflict is the point.
      }
    })
    const [file] = await (await fixture.get(`/api/files?target=${unstaged}`)).json()
    expect(file.status).toBe('conflicted')
    const response = await post('/api/write', { action: 'stage-file', file: { ...file, status: 'modified' } })
    expect(response.status).toBe(409)
    expect(fixture.repo.git('diff', '--name-only', '--diff-filter=U')).toBe('a.txt')
  })
})
