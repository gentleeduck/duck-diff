import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listTree, readTreeBytes, readTreeFile } from '../index'

let repo: TestRepo
afterEach(() => repo.cleanup())

function setup() {
  repo = createRepo()
  repo.write('.gitignore', 'dist/\n')
  repo.write('src/a.ts', 'one\n')
  repo.write('logo.bin', new Uint8Array([1, 0, 2]))
  repo.commit('base')
  repo.write('src/a.ts', 'two\n')
  repo.write('notes.txt', 'new\n')
  repo.write('dist/out.js', 'ignored\n')
}

describe('file tree', () => {
  it('lists the working tree without ignored files, or any commit', async () => {
    setup()
    expect(await listTree(repo.path, null)).toEqual(['.gitignore', 'logo.bin', 'notes.txt', 'src/a.ts'])
    expect(await listTree(repo.path, 'HEAD')).toEqual(['.gitignore', 'logo.bin', 'src/a.ts'])
    // A ref git cannot find is the caller's mistake, not the server's.
    await expect(listTree(repo.path, 'nope')).rejects.toMatchObject({ code: 'unknown-ref' })
  })

  it('reads a file from the working tree or a commit, and flags binaries', async () => {
    setup()
    expect(await readTreeFile(repo.path, null, 'src/a.ts')).toEqual({ text: 'two\n', size: 4, binary: false })
    expect(await readTreeFile(repo.path, 'HEAD', 'src/a.ts')).toEqual({ text: 'one\n', size: 4, binary: false })
    expect(await readTreeFile(repo.path, 'HEAD', 'logo.bin')).toEqual({ text: null, size: 3, binary: true })
    expect(await readTreeFile(repo.path, 'HEAD', 'missing.ts')).toBeNull()
  })
})

describe('readTreeBytes', () => {
  it('reads bytes from the working tree and from a commit, and nothing for a folder', async () => {
    repo = createRepo()
    repo.write('img/a.bin', new Uint8Array([0, 1, 2, 255]))
    const sha = repo.commit('bytes')
    repo.write('img/a.bin', new Uint8Array([9]))
    expect([...((await readTreeBytes(repo.path, null, 'img/a.bin'))?.bytes ?? [])]).toEqual([9])
    expect([...((await readTreeBytes(repo.path, sha, 'img/a.bin'))?.bytes ?? [])]).toEqual([0, 1, 2, 255])
    expect(await readTreeBytes(repo.path, null, 'img')).toBeNull()
    expect(await readTreeBytes(repo.path, sha, 'img')).toBeNull()
  })
})
