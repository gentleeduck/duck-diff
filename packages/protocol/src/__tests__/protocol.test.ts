import { describe, expect, it } from 'vitest'
import {
  ChangedFileSchema,
  CreateReviewSchema,
  type DiffTarget,
  decodeTarget,
  encodeTarget,
  HandshakeSchema,
  RefSchema,
  ReviewCommentSchema,
  ServerEventSchema,
  targetKey,
  UpdateReviewSchema,
} from '../index'

const TARGETS: DiffTarget[] = [
  { kind: 'unstaged' },
  { kind: 'staged' },
  { kind: 'local' },
  { kind: 'range', from: 'main', to: 'feat/x', mode: 'merge-base' },
  { kind: 'range', from: 'v1.0', to: 'HEAD', mode: 'two-dot' },
  { kind: 'commit', sha: 'a'.repeat(40) },
  { kind: 'commit', sha: 'b'.repeat(40), path: 'src/app.ts' },
  { kind: 'range', from: 'a1', to: 'b2', mode: 'two-dot', path: 'README.md' },
]

describe('target encoding', () => {
  it.each(TARGETS)('round-trips %o', (target) => {
    const encoded = encodeTarget(target)
    expect(encoded).toBe(encodeURIComponent(decodeURIComponent(encoded)))
    expect(decodeTarget(encoded)).toEqual(target)
  })

  it('rejects unknown kinds and bad refs', () => {
    expect(() => decodeTarget(encodeURIComponent(JSON.stringify({ kind: 'nope' })))).toThrow()
    expect(() =>
      decodeTarget(encodeURIComponent(JSON.stringify({ kind: 'range', from: '--exec=x', to: 'a', mode: 'two-dot' }))),
    ).toThrow()
    expect(() => decodeTarget('%%%')).toThrow()
  })
})

describe('schemas', () => {
  it('accepts a changed file and rejects a bad status', () => {
    const file = {
      path: 'a.txt',
      oldPath: null,
      status: 'modified',
      additions: 1,
      deletions: 0,
      binary: false,
      oldSha: null,
      newSha: null,
    }
    expect(ChangedFileSchema.parse(file)).toEqual(file)
    expect(() => ChangedFileSchema.parse({ ...file, status: 'weird' })).toThrow()
  })

  it('parses events and the handshake', () => {
    expect(ServerEventSchema.parse({ type: 'changed', reason: 'saved' })).toEqual({ type: 'changed', reason: 'saved' })
    expect(HandshakeSchema.parse({ port: 4000, token: 'ab', url: 'http://127.0.0.1:4000/?token=ab' }).port).toBe(4000)
  })
})

describe('reviews', () => {
  const draft = {
    target: { kind: 'unstaged' },
    path: 'src/app.ts',
    side: 'additions',
    line: 3,
    lineHash: 'a1b2c3d4',
    body: 'rename this',
  }

  it('accepts a new comment and refuses empty bodies and climbing paths', () => {
    expect(CreateReviewSchema.parse(draft)).toEqual(draft)
    expect(() => CreateReviewSchema.parse({ ...draft, body: '   ' })).toThrow()
    expect(() => CreateReviewSchema.parse({ ...draft, path: '../x' })).toThrow()
    expect(() => CreateReviewSchema.parse({ ...draft, line: 0 })).toThrow()
    expect(UpdateReviewSchema.parse({ body: 'better' })).toEqual({ body: 'better' })
  })

  it('parses a stored comment and the reviews event', () => {
    const comment = { ...draft, id: 'c1', createdAt: 1, updatedAt: 2 }
    expect(ReviewCommentSchema.parse(comment)).toEqual(comment)
    expect(ServerEventSchema.parse({ type: 'changed', reason: 'reviews' })).toEqual({
      type: 'changed',
      reason: 'reviews',
    })
  })

  it('keys targets the same way whatever the property order', () => {
    expect(targetKey({ kind: 'range', from: 'a', to: 'b', mode: 'two-dot' })).toBe(
      targetKey({ mode: 'two-dot', to: 'b', from: 'a', kind: 'range' } as DiffTarget),
    )
    expect(targetKey({ kind: 'staged' })).not.toBe(targetKey({ kind: 'unstaged' }))
  })
})

describe('file history and stashes', () => {
  it('refuses a path that leaves the repo', () => {
    expect(() => decodeTarget(encodeTarget({ kind: 'commit', sha: 'abc', path: '../x' }))).toThrow()
    expect(() => decodeTarget(encodeTarget({ kind: 'commit', sha: 'abc', path: '/etc/passwd' }))).toThrow()
  })

  it('keys a filtered target apart from the whole one', () => {
    expect(targetKey({ kind: 'commit', sha: 'abc', path: 'a.ts' })).not.toBe(targetKey({ kind: 'commit', sha: 'abc' }))
    expect(targetKey({ kind: 'range', from: 'a', to: 'b', mode: 'two-dot', path: 'a.ts' })).not.toBe(
      targetKey({ kind: 'range', from: 'a', to: 'b', mode: 'two-dot' }),
    )
  })

  it('accepts stash refs with their message', () => {
    const ref = {
      name: 'stash@{0}',
      kind: 'stash',
      sha: 'c'.repeat(40),
      committedAt: 1,
      current: false,
      subject: 'WIP',
    }
    expect(RefSchema.parse(ref)).toEqual(ref)
  })
})

describe('jobs', () => {
  it('parses a job and its output events', () => {
    const job = {
      id: 'j1',
      title: 'Commit',
      command: 'git commit --file=-',
      startedAt: 1,
      endedAt: null,
      status: 'running',
      error: null,
    }
    expect(ServerEventSchema.parse({ type: 'job', job })).toEqual({ type: 'job', job })
    expect(ServerEventSchema.parse({ type: 'job-output', id: 'j1', data: 'hi' }).type).toBe('job-output')
    expect(() => ServerEventSchema.parse({ type: 'job', job: { ...job, status: 'maybe' } })).toThrow()
  })
})
