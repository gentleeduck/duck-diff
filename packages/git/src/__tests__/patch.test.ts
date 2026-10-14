import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { getPatch, listFiles, streamPatch } from '../index'

describe('getPatch', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('returns one file patch for an unstaged edit', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    repo.write('b.txt', 'two\n')
    repo.commit('base')
    repo.write('a.txt', 'ONE\n')
    repo.write('b.txt', 'TWO\n')
    const patch = await getPatch(repo.path, { kind: 'unstaged' }, { path: 'a.txt', oldPath: null, status: 'modified' })
    expect(patch.startsWith('diff --git a/a.txt b/a.txt')).toBe(true)
    expect(patch).toContain('-one\n+ONE')
    expect(patch).not.toContain('b.txt')
  })

  it('returns a new-file patch for an untracked file', async () => {
    repo = createRepo()
    repo.write('keep.txt', 'k\n')
    repo.commit('base')
    repo.write('new.txt', 'hello\n')
    const patch = await getPatch(
      repo.path,
      { kind: 'unstaged' },
      { path: 'new.txt', oldPath: null, status: 'untracked' },
    )
    expect(patch).toContain('new file mode')
    expect(patch).toContain('+hello')
    expect(patch).toContain('b/new.txt')
  })

  it('returns a rename patch covering both paths', async () => {
    repo = createRepo()
    repo.write('old.txt', 'same content that is long enough to be detected as a rename\n')
    repo.commit('base')
    repo.git('mv', 'old.txt', 'new.txt')
    const [file] = await listFiles(repo.path, { kind: 'staged' })
    if (!file) throw new Error('expected a staged file')
    const patch = await getPatch(repo.path, { kind: 'staged' }, file)
    expect(patch).toContain('rename from old.txt')
    expect(patch).toContain('rename to new.txt')
  })

  it('returns a commit patch', async () => {
    repo = createRepo()
    repo.write('a.txt', '1\n')
    repo.commit('base')
    repo.write('a.txt', '2\n')
    const sha = repo.commit('change')
    const patch = await getPatch(
      repo.path,
      { kind: 'commit', sha },
      { path: 'a.txt', oldPath: null, status: 'modified' },
    )
    expect(patch).toContain('-1\n+2')
  })

  it('marks binary files without content', async () => {
    repo = createRepo()
    repo.write('k.txt', 'k\n')
    repo.commit('base')
    repo.write('img.bin', new Uint8Array([0, 1, 2, 0, 255]))
    repo.git('add', 'img.bin')
    const patch = await getPatch(repo.path, { kind: 'staged' }, { path: 'img.bin', oldPath: null, status: 'added' })
    expect(patch).toContain('Binary files')
  })
})

describe('streamPatch', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  it('streams the same text getPatch returns', async () => {
    repo = createRepo()
    repo.write('big.txt', 'a\n'.repeat(30_000))
    repo.commit('base')
    repo.write('big.txt', 'b\n'.repeat(30_000))
    const file = { path: 'big.txt', oldPath: null, status: 'modified' as const }
    let streamed = ''
    for await (const chunk of streamPatch(repo.path, { kind: 'unstaged' }, file)) streamed += chunk
    expect(streamed).toBe(await getPatch(repo.path, { kind: 'unstaged' }, file))
  })
})
