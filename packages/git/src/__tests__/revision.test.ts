import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRevision } from '../index'

describe('resolveRevision', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  function history() {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    const first = repo.commit('first')
    repo.write('a.txt', '2\n')
    const second = repo.commit('fix the parser')
    repo.write('a.txt', '3\n')
    const third = repo.commit('third')
    return { first, second, third }
  }

  it('says which commit a short hash, a name or a relative ref is, keeping what was typed', async () => {
    const { second, third } = history()
    expect(await resolveRevision(repo.path, third.slice(0, 9))).toEqual({
      kind: 'commit',
      ref: third.slice(0, 9),
      sha: third,
      subject: 'third',
      note: null,
    })
    expect(await resolveRevision(repo.path, 'HEAD~1')).toMatchObject({ kind: 'commit', ref: 'HEAD~1', sha: second })
  })

  it('reads ^abc as the commit before abc, as abc^ is, and says so', async () => {
    const { first, second } = history()
    expect(await resolveRevision(repo.path, `^${second.slice(0, 9)}`)).toEqual({
      kind: 'commit',
      ref: `${second.slice(0, 9)}^`,
      sha: first,
      subject: 'first',
      note: `before ${second.slice(0, 7)}`,
    })
    expect(await resolveRevision(repo.path, `^${first}`)).toEqual({
      kind: 'unknown',
      reason: `${first.slice(0, 7)} is the first commit; nothing comes before it`,
    })
  })

  it('takes anything git reads as a commit, spaces and all, by its hash when the text cannot be a ref', async () => {
    const { second } = history()
    expect(await resolveRevision(repo.path, ':/fix the parser')).toEqual({
      kind: 'commit',
      ref: second,
      sha: second,
      subject: 'fix the parser',
      note: null,
    })
  })

  it('turns a typed range into both sides, two dots as they are and three from where they split', async () => {
    const { first, third } = history()
    expect(await resolveRevision(repo.path, `${first.slice(0, 7)}..HEAD`)).toMatchObject({
      kind: 'range',
      mode: 'two-dot',
      from: { ref: first.slice(0, 7), sha: first },
      to: { ref: 'HEAD', sha: third },
    })
    expect(await resolveRevision(repo.path, 'HEAD~2...HEAD')).toMatchObject({ kind: 'range', mode: 'merge-base' })
  })

  it('says why when there is no such commit', async () => {
    history()
    expect(await resolveRevision(repo.path, '1eb597840')).toEqual({
      kind: 'unknown',
      reason: 'no commit starts with 1eb597840 here',
    })
    expect(await resolveRevision(repo.path, 'nope')).toEqual({
      kind: 'unknown',
      reason: 'git knows no commit called nope here',
    })
    expect(await resolveRevision(repo.path, 'HEAD..nope')).toEqual({
      kind: 'unknown',
      reason: 'git knows no commit called nope here',
    })
  })
})
