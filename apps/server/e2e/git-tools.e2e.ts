import { spawn } from 'node:child_process'
import { once } from 'node:events'
import type { TestRepo } from '@duck-diff/testing'
import { BINARY, expect, openedPage, test } from './fixture'

// duck-diff as git's merge tool, diff tool and rebase editor, for this repo only, as git-setup sets it globally.
function setUp(repo: TestRepo) {
  const config: [string, string][] = [
    ['merge.tool', 'duck-diff'],
    ['mergetool.duck-diff.cmd', `${BINARY} mergetool "$MERGED"`],
    ['mergetool.duck-diff.trustExitCode', 'true'],
    ['mergetool.prompt', 'false'],
    ['mergetool.keepBackup', 'false'],
    ['diff.tool', 'duck-diff'],
    ['difftool.duck-diff.cmd', `${BINARY} difftool "$LOCAL" "$REMOTE" "$MERGED"`],
    ['difftool.duck-diff.trustExitCode', 'true'],
    ['difftool.prompt', 'false'],
    ['sequence.editor', `${BINARY} rebase-todo`],
  ]
  for (const [key, value] of config) repo.git('config', key, value)
}

// A git command run as from a terminal, with the server's environment so the tool finds it.
function git(repo: TestRepo, env: Record<string, string | undefined>, args: string[]) {
  const child = spawn('git', args, { cwd: repo.path, env: { ...env, GIT_EDITOR: 'true' }, stdio: 'pipe' })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  return once(child, 'exit').then(([code]) => ({ code: code as number, output }))
}

test('git mergetool resolves in a duck-diff window with only the merge in it', async ({ app, repo, context }) => {
  setUp(repo)
  repo.commit('work in progress')
  repo.write('list.txt', 'one\nkeep\n')
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('list.txt', 'one feature\nkeep\n')
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('list.txt', 'one main\nkeep\n')
  repo.commit('main')
  expect(() => repo.git('merge', 'feature')).toThrow()

  const run = git(repo, app.env, ['mergetool'])
  const tool = await openedPage(context, app.browsed)
  const editor = tool.getByRole('region', { name: 'Merge list.txt' })
  await expect(editor).toBeVisible()
  await expect(tool.getByRole('navigation', { name: 'Views' })).toHaveCount(0)
  await expect(tool.getByRole('button', { name: 'Abort' })).toHaveCount(0)
  await editor.getByRole('button', { name: 'All incoming' }).click()
  await editor.getByRole('button', { name: 'Mark resolved' }).click()

  const { code, output } = await run
  expect(code, output).toBe(0)
  expect(repo.git('ls-files', '-u')).toBe('')
  expect(repo.git('show', ':list.txt')).toBe('one feature\nkeep')
  await expect(tool.getByText(/Every conflict is resolved|git has it from here/).first()).toBeVisible()
})

test('git rebase -i plans in duck-diff and git replays the plan', async ({ app, repo, context }) => {
  setUp(repo)
  repo.commit('work in progress')
  repo.write('one.txt', '1\n')
  repo.commit('one')
  repo.write('two.txt', '2\n')
  repo.commit('two')

  const run = git(repo, app.env, ['rebase', '-i', 'HEAD~2'])
  const tool = await openedPage(context, app.browsed)
  const plan = tool.getByRole('region', { name: 'Rebase plan for git' })
  await expect(plan.getByRole('listitem')).toHaveCount(2)
  await plan.getByRole('button', { name: 'Move two up' }).click()
  await plan.getByRole('button', { name: 'Start rebase' }).click()

  const { code, output } = await run
  expect(code, output).toBe(0)
  expect(repo.git('log', '-2', '--format=%s').trim().split('\n')).toEqual(['one', 'two'])
})

test('git difftool shows each file in duck-diff and goes on when asked', async ({ app, repo, context }) => {
  setUp(repo)
  const run = git(repo, app.env, ['difftool'])
  const tool = await openedPage(context, app.browsed)
  await expect(tool.locator('main')).toContainText('export const answer = 42')
  await expect(tool.getByRole('banner')).toContainText('src/app.ts')
  await tool.getByRole('button', { name: 'Next file' }).click()
  const { code, output } = await run
  expect(code, output).toBe(0)
})

test('a cherry-pick stopped on a conflict goes through git mergetool the same way', async ({ app, repo, context }) => {
  setUp(repo)
  repo.commit('work in progress')
  repo.write('list.txt', 'one\n')
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('list.txt', 'one feature\n')
  const picked = repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('list.txt', 'one main\n')
  repo.commit('main')
  expect(() => repo.git('cherry-pick', picked)).toThrow()

  const run = git(repo, app.env, ['mergetool'])
  const tool = await openedPage(context, app.browsed)
  await expect(tool.getByRole('banner')).toContainText(
    `Cherry-picking ${repo.git('rev-parse', '--short', picked).trim()}`,
  )
  const editor = tool.getByRole('region', { name: 'Merge list.txt' })
  await editor.getByRole('button', { name: 'All current' }).click()
  await editor.getByRole('button', { name: 'Mark resolved' }).click()
  const { code, output } = await run
  expect(code, output).toBe(0)
  expect(repo.git('show', ':list.txt')).toBe('one main')
})

test('a rebase todo duck-diff does not plan goes to the usual editor', async ({ app, repo }) => {
  setUp(repo)
  repo.commit('work in progress')
  repo.write('one.txt', '1\n')
  repo.commit('one')
  // An exec line is not something the planner shows; GIT_EDITOR (true here) takes the todo as it is.
  const { code, output } = await git(repo, app.env, ['rebase', '-i', '--exec', 'true', 'HEAD~1'])
  expect(code, output).toBe(0)
  expect(repo.git('log', '-1', '--format=%s').trim()).toBe('one')
})
