import { describe, expect, it } from 'vitest'
import {
  ChangedFileSchema,
  type DiffTarget,
  decodeTarget,
  encodeTarget,
  HandshakeSchema,
  ServerEventSchema,
} from '../index'

const TARGETS: DiffTarget[] = [
  { kind: 'unstaged' },
  { kind: 'staged' },
  { kind: 'local' },
  { kind: 'range', from: 'main', to: 'feat/x', mode: 'merge-base' },
  { kind: 'range', from: 'v1.0', to: 'HEAD', mode: 'two-dot' },
  { kind: 'commit', sha: 'a'.repeat(40) },
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
