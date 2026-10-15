import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { listTree, readTreeFile } from '../index'

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
  })

  it('reads a file from the working tree or a commit, and flags binaries', async () => {
    setup()
    expect(await readTreeFile(repo.path, null, 'src/a.ts')).toEqual({ text: 'two\n', size: 4, binary: false })
    expect(await readTreeFile(repo.path, 'HEAD', 'src/a.ts')).toEqual({ text: 'one\n', size: 4, binary: false })
    expect(await readTreeFile(repo.path, 'HEAD', 'logo.bin')).toEqual({ text: null, size: 3, binary: true })
    expect(await readTreeFile(repo.path, 'HEAD', 'missing.ts')).toBeNull()
  })
})
