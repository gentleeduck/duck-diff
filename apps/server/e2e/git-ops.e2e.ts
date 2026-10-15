import type { TestRepo } from '@duck-diff/testing'
import { expect, test } from './fixture'

// side and main both edit src/app.ts, so merging side stops on a conflict.
function diverge(repo: TestRepo) {
  repo.git('stash', '-u')
  repo.git('switch', '-q', '-c', 'side')
  repo.write('src/app.ts', 'export const answer = 7\n')
  repo.commit('side answer')
  repo.git('switch', '-q', 'main')
  repo.write('src/app.ts', 'export const answer = 9\n')
  repo.commit('main answer')
}

test('resolves a merge conflict from the stage panel', async ({ page, app, repo }) => {
  diverge(repo)
  try {
    repo.git('merge', '--no-edit', 'side')
  } catch {
    // The conflict is the point.
  }
  await page.goto(app.url)
  await page.getByRole('tab', { name: 'Stage' }).click()
  const conflicts = page.getByRole('listbox', { name: 'Merge conflicts' })
  await conflicts.getByRole('option', { name: /app\.ts/ }).hover()
  await conflicts.getByRole('button', { name: 'Take theirs for src/app.ts' }).click()
  await expect(conflicts).toBeHidden()
  const box = page.getByRole('form', { name: 'Commit' })
  await box.getByRole('textbox', { name: 'Commit message' }).fill('merge side')
  await box.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect.poll(() => repo.git('log', '-1', '--format=%s').trim()).toBe('merge side')
  expect(repo.git('show', 'HEAD:src/app.ts').trim()).toBe('export const answer = 7')
})

test('tags, renames and hard-resets from the graph menus, confirming the reset', async ({ page, app, repo }) => {
  repo.commit('second')
  await page.goto(`${app.url}&view=graph`)
  const commits = page.getByRole('listbox', { name: 'Commits' })
  await commits.getByRole('option', { name: /base/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Create tag here...' }).click()
  await page.getByRole('textbox', { name: 'Tag name' }).fill('v0.1')
  await page.getByRole('button', { name: 'Create tag' }).click()
  await expect.poll(() => repo.git('tag').trim()).toBe('v0.1')

  await page.getByRole('region', { name: 'Branches' }).getByText('main', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename...' }).click()
  await page.getByRole('textbox', { name: 'New name' }).fill('trunk')
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect.poll(() => repo.git('branch', '--show-current').trim()).toBe('trunk')

  await commits.getByRole('option', { name: /base/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Reset current branch here' }).hover()
  await page.getByRole('menuitem', { name: 'Hard: discard changes...' }).click()
  await page.getByRole('button', { name: 'Reset and discard' }).click()
  await expect.poll(() => repo.git('log', '-1', '--format=%s').trim()).toBe('base')
})

test('discards every change at once and undoes it from the toast', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await page.getByRole('tab', { name: 'Stage' }).click()
  await page.getByRole('button', { name: 'Discard all changes' }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect.poll(() => repo.git('status', '--porcelain').trim()).toBe('')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => repo.git('status', '--porcelain').trim().split('\n').length).toBe(2)
})

test('blames each line of a file and opens the commit behind it', async ({ page, app }) => {
  await page.goto(`${app.url}&view=files`)
  await page.getByRole('button', { name: 'Blame: who changed each line' }).click()
  await page
    .getByRole('button', { name: /Duck Test/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/graph/)
  await expect(page.getByRole('complementary', { name: 'Commit' })).toContainText('base')
})
