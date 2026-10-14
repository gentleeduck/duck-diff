import { afterEach, describe, expect, it } from 'bun:test'
import { encodeTarget } from '@duck-diff/protocol'
import { type Fixture, startFixture } from './helpers'

let fixture: Fixture
afterEach(async () => fixture.close())

const unstaged = encodeTarget({ kind: 'unstaged' })

describe('/api/diff', () => {
  it('streams the whole patch with untracked files', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', '1\n')
      repo.commit('base')
      repo.write('a.txt', '2\n')
      repo.write('new.txt', 'n\n')
    })
    const response = await fixture.get(`/api/diff?target=${unstaged}`)
    expect(response.headers.get('content-type')).toContain('text/plain')
    const text = await response.text()
    expect(text).toContain('diff --git a/a.txt b/a.txt')
    expect(text).toContain('diff --git a/new.txt b/new.txt')
  })
})

describe('/api/content', () => {
  it('returns both sides of a changed file', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'old\n')
      repo.commit('base')
      repo.write('a.txt', 'new\n')
    })
    const old = await (await fixture.get(`/api/content?target=${unstaged}&side=old&path=a.txt`)).json()
    const next = await (await fixture.get(`/api/content?target=${unstaged}&side=new&path=a.txt`)).json()
    expect(old).toEqual({ contents: 'old\n' })
    expect(next).toEqual({ contents: 'new\n' })
  })

  it('reads the old path of a rename on the old side', async () => {
    fixture = await startFixture((repo) => {
      repo.write('before.txt', 'same content that is long enough to be detected as a rename\n')
      repo.commit('base')
      repo.git('mv', 'before.txt', 'after.txt')
    })
    const staged = encodeTarget({ kind: 'staged' })
    const response = await fixture.get(`/api/content?target=${staged}&side=old&path=after.txt&oldPath=before.txt`)
    expect((await response.json()).contents).toContain('same content')
  })

  it('refuses paths outside the diff', async () => {
    fixture = await startFixture((repo) => {
      repo.write('a.txt', 'a\n')
      repo.commit('base')
      repo.write('a.txt', 'b\n')
    })
    const response = await fixture.get(`/api/content?target=${unstaged}&side=new&path=../../etc/hostname`)
    expect(response.status).toBe(400)
    const forged = await fixture.get(`/api/content?target=${unstaged}&side=old&path=a.txt&oldPath=other.txt`)
    expect(forged.status).toBe(400)
  })
})
