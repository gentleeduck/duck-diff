import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTodo, readTodo, snapshotCommit, writeTodo } from '../index'

let repo: TestRepo
afterEach(() => repo?.cleanup())

describe('snapshotCommit', () => {
  it('keeps one side of a difftool run as a commit holding that file, nothing else', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.commit('base')
    const dir = mkdtempSync(join(tmpdir(), 'duck-snap-'))
    writeFileSync(join(dir, 'left'), 'old\n')
    writeFileSync(join(dir, 'right'), 'new\n')
    const from = await snapshotCommit(repo.path, 'src/x.ts', join(dir, 'left'))
    const to = await snapshotCommit(repo.path, 'src/x.ts', join(dir, 'right'))
    expect(repo.git('show', `${from}:src/x.ts`)).toBe('old')
    expect(repo.git('diff', '--name-only', from, to).trim()).toBe('src/x.ts')
    const empty = await snapshotCommit(repo.path, 'src/x.ts', '/dev/null')
    expect(repo.git('ls-tree', '-r', '--name-only', empty).trim()).toBe('')
    // The user's own index and branch are untouched.
    expect(repo.git('status', '--porcelain')).toBe('')
  })
})

describe('rebase todo', () => {
  it('reads the commits a todo lists, short actions too, and gives up on lines it does not plan', () => {
    expect(parseTodo('pick abc1234 one\n# a comment\n\nf def5678 two\n')).toEqual([
      { sha: 'abc1234', action: 'pick' },
      { sha: 'def5678', action: 'fixup' },
    ])
    expect(parseTodo('pick abc1234 one\nexec make test\n')).toBeNull()
    expect(parseTodo('fixup -C abc1234 one\n')).toBeNull()
  })

  it('names each commit of the todo and writes the plan back, rewording through a message file', async () => {
    repo = createRepo()
    repo.write('a.txt', 'a\n')
    repo.commit('base')
    repo.write('a.txt', 'b\n')
    const one = repo.commit('one')
    repo.write('a.txt', 'c\n')
    const two = repo.commit('two')
    const dir = mkdtempSync(join(tmpdir(), 'duck-todo-'))
    const todo = join(dir, 'git-rebase-todo')
    writeFileSync(todo, `pick ${one.slice(0, 7)} one\npick ${two.slice(0, 7)} two\n# Commands:\n`)
    const steps = await readTodo(repo.path, todo)
    expect(steps?.map((step) => [step.commit.sha, step.commit.subject, step.action])).toEqual([
      [one, 'one', 'pick'],
      [two, 'two', 'pick'],
    ])
    await writeTodo(todo, [
      { sha: two, action: 'reword', message: 'two, said better' },
      { sha: one, action: 'drop' },
    ])
    const written = readFileSync(todo, 'utf8')
    expect(written).toContain(`pick ${two}`)
    expect(written).toContain(`drop ${one}`)
    expect(readFileSync(join(dir, 'duck-diff-message-0'), 'utf8')).toBe('two, said better')
  })
})
