import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type ChangedFile,
  discardFile,
  discardHunk,
  getPatch,
  listFiles,
  splitPatch,
  stageFile,
  stageHunk,
  unstageFile,
  unstageHunk,
} from '../index'

const BASE = `${Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')}\n`

function twoHunks(content: string) {
  const lines = content.split('\n')
  lines[1] = 'line 2 changed'
  lines[27] = 'line 28 changed'
  return lines.join('\n')
}

describe('splitPatch', () => {
  it('splits a file patch into its header and hunks', () => {
    const patch = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+y\n@@ -9 +9 @@\n-p\n+q\n'
    const { header, hunks } = splitPatch(patch)
    expect(header).toBe('diff --git a/a b/a\n--- a/a\n+++ b/a\n')
    expect(hunks).toEqual(['@@ -1 +1 @@\n-x\n+y\n', '@@ -9 +9 @@\n-p\n+q\n'])
  })
})

async function headers(repo: TestRepo, kind: 'unstaged' | 'staged', file: ChangedFile) {
  return splitPatch(await getPatch(repo.path, { kind }, file)).hunks.map((hunk) => hunk.slice(0, hunk.indexOf('\n')))
}

describe('hunk writes', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  async function seed() {
    repo = createRepo()
    repo.write('a.txt', BASE)
    repo.commit('base')
    repo.write('a.txt', twoHunks(BASE))
    const [file] = await listFiles(repo.path, { kind: 'unstaged' })
    if (!file) throw new Error('expected a change')
    return file
  }

  it('stages only the chosen hunk', async () => {
    const file = await seed()
    const [, second = ''] = await headers(repo, 'unstaged', file)
    await stageHunk(repo.path, file, 1, second)
    expect(repo.git('diff', '--cached')).toContain('+line 28 changed')
    expect(repo.git('diff', '--cached')).not.toContain('line 2 changed')
    expect(repo.git('diff')).toContain('+line 2 changed')
  })

  it('refuses a hunk whose header no longer matches', async () => {
    const file = await seed()
    await expect(stageHunk(repo.path, file, 0, '@@ -1,4 +1,4 @@ nope')).rejects.toMatchObject({ code: 'stale' })
    expect(repo.git('diff', '--cached')).toBe('')
  })

  it('unstages one hunk back into the working tree', async () => {
    await seed()
    repo.git('add', 'a.txt')
    const [staged] = await listFiles(repo.path, { kind: 'staged' })
    if (!staged) throw new Error('expected a staged change')
    const [first = ''] = await headers(repo, 'staged', staged)
    await unstageHunk(repo.path, staged, 0, first)
    expect(repo.git('diff', '--cached')).not.toContain('line 2 changed')
    expect(repo.git('diff', '--cached')).toContain('line 28 changed')
    expect(repo.git('diff')).toContain('+line 2 changed')
  })

  it('discards one hunk from the working tree', async () => {
    const file = await seed()
    const [first = ''] = await headers(repo, 'unstaged', file)
    await discardHunk(repo.path, file, 0, first)
    expect(repo.git('diff')).toContain('+line 28 changed')
    expect(repo.git('diff')).not.toContain('line 2 changed')
  })

  it('refuses hunk staging for untracked files', async () => {
    repo = createRepo()
    repo.write('k', 'k\n')
    repo.commit('base')
    repo.write('new.txt', 'n\n')
    const file = (await listFiles(repo.path, { kind: 'unstaged' })).find((f) => f.path === 'new.txt')
    if (!file) throw new Error('expected new.txt')
    await expect(stageHunk(repo.path, file, 0, '@@ -0,0 +1 @@')).rejects.toMatchObject({ code: 'failed' })
  })
})

describe('file writes', () => {
  let repo: TestRepo
  afterEach(() => repo.cleanup())

  function seed() {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.write('old-name.txt', 'same content that is long enough to be detected as a rename\n')
    repo.commit('base')
    repo.write('a.txt', 'A\n')
    repo.write('new.txt', 'n\n')
  }

  async function unstagedFile(path: string) {
    const file = (await listFiles(repo.path, { kind: 'unstaged' })).find((f) => f.path === path)
    if (!file) throw new Error(`expected ${path}`)
    return file
  }

  it('stages a whole file, including untracked ones', async () => {
    seed()
    await stageFile(repo.path, await unstagedFile('a.txt'))
    await stageFile(repo.path, await unstagedFile('new.txt'))
    expect(repo.git('diff', '--cached', '--name-only')).toBe('a.txt\nnew.txt')
  })

  it('refuses a file whose content changed since the page loaded', async () => {
    seed()
    const file = await unstagedFile('a.txt')
    repo.write('a.txt', 'changed again\n')
    await expect(stageFile(repo.path, file)).rejects.toMatchObject({ code: 'stale' })
  })

  it('unstages a rename back to both paths', async () => {
    seed()
    repo.git('mv', 'old-name.txt', 'new-name.txt')
    const [renamed] = await listFiles(repo.path, { kind: 'staged' })
    if (!renamed) throw new Error('expected the rename')
    await unstageFile(repo.path, renamed)
    expect(repo.git('diff', '--cached', '--name-only')).toBe('')
  })

  it('discards tracked changes and deletes untracked files', async () => {
    seed()
    await discardFile(repo.path, await unstagedFile('a.txt'))
    await discardFile(repo.path, await unstagedFile('new.txt'))
    expect(repo.git('status', '--porcelain')).toBe('')
  })
})
