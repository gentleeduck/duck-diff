import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  bisectMark,
  bisectReset,
  bisectRun,
  cherryPickRange,
  continueOperation,
  fixupInto,
  interactiveRebase,
  readBisect,
  readOperation,
  rebasePlan,
  todoText,
} from '../index'

let repo: TestRepo
afterEach(() => repo?.cleanup())

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Duck Test',
    GIT_AUTHOR_EMAIL: 'test@duck.local',
    GIT_COMMITTER_NAME: 'Duck Test',
    GIT_COMMITTER_EMAIL: 'test@duck.local',
  })
})

// base, then a b c d each adding its own file.
function history(): { base: string; shas: string[] } {
  repo = createRepo()
  repo.write('base.txt', 'base\n')
  const base = repo.commit('base')
  const shas = ['a', 'b', 'c', 'd'].map((name) => {
    repo.write(`${name}.txt`, `${name}\n`)
    return repo.commit(`add ${name}`)
  })
  return { base, shas }
}

const subjects = () => repo.git('log', '--format=%s').split('\n')

describe('rebasePlan', () => {
  it('lists the commits after the base, oldest first', async () => {
    const { base, shas } = history()
    const plan = await rebasePlan(repo.path, base)
    expect(plan.map((commit) => commit.sha)).toEqual(shas)
    expect(plan[0]).toMatchObject({ subject: 'add a', author: 'Duck Test' })
  })
})

describe('todoText', () => {
  it('writes each step, rewording through an amend from a file', () => {
    expect(
      todoText(
        [
          { sha: 'aaa', action: 'pick' },
          { sha: 'bbb', action: 'reword', message: 'new' },
          { sha: 'ccc', action: 'fixup' },
        ],
        (index) => `/tmp/m ${index}`,
      ),
    ).toBe("pick aaa\npick bbb\nexec git commit --amend --only --no-verify --allow-empty -F '/tmp/m 1'\nfixup ccc\n")
  })
})

describe('interactiveRebase', () => {
  it('reorders, rewords, squashes, fixes up and drops in one go', async () => {
    const { base, shas } = history()
    const [a, b, c, d] = shas as [string, string, string, string]
    const result = await interactiveRebase(repo.path, base, [
      { sha: c, action: 'pick' },
      { sha: a, action: 'reword', message: "a, renamed\n\nwith a body and 'quotes'" },
      { sha: b, action: 'fixup' },
      { sha: d, action: 'drop' },
    ])
    expect(result).toEqual({ conflicts: false, stopped: false })
    expect(subjects()).toEqual(['a, renamed', 'add c', 'base'])
    expect(repo.git('log', '-1', '--format=%B').trim()).toBe("a, renamed\n\nwith a body and 'quotes'")
    expect(repo.git('ls-files')).toBe('a.txt\nb.txt\nbase.txt\nc.txt')
  })

  it('stops on edit and continues', async () => {
    const { base, shas } = history()
    const result = await interactiveRebase(
      repo.path,
      base,
      shas.map((sha, index) => ({ sha, action: index === 1 ? ('edit' as const) : ('pick' as const) })),
    )
    expect(result).toEqual({ conflicts: false, stopped: true })
    expect(await readOperation(repo.path)).toBe('rebase')
    await continueOperation(repo.path)
    expect(await readOperation(repo.path)).toBeNull()
    expect(subjects()).toHaveLength(5)
  })

  it('refuses a plan that leaves out commits or starts with a squash', async () => {
    const { base, shas } = history()
    await expect(interactiveRebase(repo.path, base, [{ sha: shas[0] as string, action: 'pick' }])).rejects.toThrow(
      /every commit/,
    )
    await expect(
      interactiveRebase(
        repo.path,
        base,
        shas.map((sha, index) => ({ sha, action: index === 0 ? ('squash' as const) : ('pick' as const) })),
      ),
    ).rejects.toThrow(/first/)
  })
})

describe('fixupInto', () => {
  it('commits the staged changes as a fixup and folds it into the commit', async () => {
    const { shas } = history()
    repo.write('b.txt', 'b fixed\n')
    repo.git('add', 'b.txt')
    repo.write('unrelated.txt', 'left alone\n')
    await fixupInto(repo.path, shas[1] as string)
    expect(subjects()).toEqual(['add d', 'add c', 'add b', 'add a', 'base'])
    expect(repo.git('show', 'HEAD~2:b.txt')).toBe('b fixed')
    expect(repo.git('status', '--porcelain')).toBe('?? unrelated.txt')
  })
})

describe('cherryPickRange', () => {
  it('picks several commits in order onto another branch', async () => {
    const { base, shas } = history()
    repo.git('checkout', '-q', '-b', 'other', base)
    expect(await cherryPickRange(repo.path, [shas[0] as string, shas[2] as string])).toEqual({ conflicts: false })
    expect(subjects()).toEqual(['add c', 'add a', 'base'])
  })
})

describe('bisect', () => {
  it('starts from a mark, narrows down, names the culprit and resets', async () => {
    const { base, shas } = history()
    expect((await readBisect(repo.path)).active).toBe(false)
    await bisectMark(repo.path, 'bad', shas[3] as string)
    await bisectMark(repo.path, 'good', base)
    let state = await readBisect(repo.path)
    expect(state).toMatchObject({ active: true, culprit: null })
    expect(state.remaining).toBeGreaterThan(0)
    // c.txt arrived in the third commit, which is what a test for it finds.
    await bisectRun(repo.path, 'test ! -f c.txt')
    state = await readBisect(repo.path)
    expect(state.culprit).toEqual({ sha: shas[2], subject: 'add c' })
    await bisectReset(repo.path)
    expect((await readBisect(repo.path)).active).toBe(false)
  })
})
