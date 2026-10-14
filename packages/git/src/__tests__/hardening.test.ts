import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { getPatch, listFiles, streamDiff } from '../index'

let repo: TestRepo
afterEach(() => repo.cleanup())

async function text(stream: AsyncIterable<string>) {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
}

function conflicted() {
  repo = createRepo()
  repo.write('a.txt', 'one\n')
  repo.write('b.txt', 'keep\n')
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
    // The conflict is the point; git exits non-zero for it.
  }
}

describe('merge conflicts', () => {
  it('lists a conflicted file once, as conflicted, on working-tree targets', async () => {
    conflicted()
    for (const kind of ['unstaged', 'local'] as const) {
      const files = await listFiles(repo.path, { kind })
      expect(files.map((file) => [file.path, file.status])).toEqual([['a.txt', 'conflicted']])
      expect(files[0]?.additions).toBeGreaterThan(0)
    }
  })

  it('leaves conflicted files out of staged', async () => {
    conflicted()
    expect(await listFiles(repo.path, { kind: 'staged' })).toEqual([])
  })

  it('shows the conflict markers as a normal patch against HEAD', async () => {
    conflicted()
    const whole = await text(streamDiff(repo.path, { kind: 'unstaged' }))
    expect(whole).not.toContain('diff --cc')
    expect(whole.match(/^diff --git a\/a\.txt/gm)).toHaveLength(1)
    expect(whole).toContain('+<<<<<<< HEAD')
    const [file] = await listFiles(repo.path, { kind: 'unstaged' })
    if (!file) throw new Error('no file')
    expect(await getPatch(repo.path, { kind: 'unstaged' }, file)).toContain('+>>>>>>> other')
  })
})

describe('a repo with no commits', () => {
  it('compares local and staged against nothing', async () => {
    repo = createRepo()
    repo.write('a.txt', 'one\n')
    repo.git('add', 'a.txt')
    repo.write('b.txt', 'two\n')
    expect((await listFiles(repo.path, { kind: 'local' })).map((file) => file.path)).toEqual(['a.txt', 'b.txt'])
    expect((await listFiles(repo.path, { kind: 'staged' })).map((file) => file.path)).toEqual(['a.txt'])
    expect(await text(streamDiff(repo.path, { kind: 'local' }))).toContain('+one')
  })
})

describe('binary sizes and generated files', () => {
  it('reports both sizes of a changed binary file', async () => {
    repo = createRepo()
    repo.write('logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]))
    repo.commit('base')
    repo.write('logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5]))
    const [unstaged] = await listFiles(repo.path, { kind: 'unstaged' })
    expect(unstaged).toMatchObject({ binary: true, oldSize: 7, newSize: 10 })
    repo.commit('bigger')
    const [commit] = await listFiles(repo.path, { kind: 'commit', sha: 'HEAD' })
    expect(commit).toMatchObject({ oldSize: 7, newSize: 10 })
  })

  it('marks files git attributes call generated', async () => {
    repo = createRepo()
    repo.write('.gitattributes', 'dist/** linguist-generated\n')
    repo.write('dist/app.js', 'a\n')
    repo.write('src/app.ts', 'a\n')
    repo.commit('base')
    repo.write('dist/app.js', 'b\n')
    repo.write('src/app.ts', 'b\n')
    const files = await listFiles(repo.path, { kind: 'unstaged' })
    expect(files.map((file) => [file.path, file.generated])).toEqual([
      ['dist/app.js', true],
      ['src/app.ts', false],
    ])
  })
})
