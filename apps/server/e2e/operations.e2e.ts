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

test('a conflicting merge from the graph stops, shows the banner, and aborts', async ({ page, app, repo }) => {
  diverge(repo)
  await page.goto(`${app.url}&view=graph`)
  const branches = page.getByRole('region', { name: 'Branches' })
  await branches.getByText('side', { exact: true }).hover()
  await branches.getByRole('button', { name: 'Merge side into main' }).click()
  await expect(page.getByText(/Merge stopped on conflicts/)).toBeVisible()

  await page.getByRole('button', { name: 'Changes' }).click()
  const banner = page.getByRole('status').filter({ hasText: 'A merge is in progress' })
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: 'Abort' }).click()
  await page.getByRole('button', { name: 'Abort merge' }).click()
  await expect(banner).toBeHidden()
  expect(repo.git('status', '--porcelain')).toBe('')
})

test('cherry-picks and reverts a commit from its panel', async ({ page, app, repo }) => {
  repo.git('stash', '-u')
  repo.git('switch', '-q', '-c', 'side')
  repo.write('extra.txt', 'extra\n')
  repo.commit('add extra')
  repo.git('switch', '-q', 'main')
  await page.goto(`${app.url}&view=graph`)
  await page
    .getByRole('listbox', { name: 'Commits' })
    .getByRole('option', { name: /add extra/ })
    .click()
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await panel.getByRole('button', { name: 'Cherry-pick' }).click()
  await expect.poll(() => repo.git('log', '-1', '--format=%s').trim()).toBe('add extra')
  await page.getByRole('listbox', { name: 'Commits' }).getByRole('option').first().click()
  await panel.getByRole('button', { name: 'Revert' }).click()
  await expect.poll(() => repo.git('log', '-1', '--format=%s').trim()).toBe('Revert "add extra"')
})
