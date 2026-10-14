import { expect, test } from './fixture'

test("opens a file's history and shows one commit's change to just that file", async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.getByRole('button', { name: 'File history' }).first().click()
  await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: /^base/ }).click()
  // The base commit added two files; the filtered view shows only the one asked about.
  await expect(page.getByRole('banner')).toContainText('1 file')
  await expect(page.getByRole('banner')).toContainText('src/app.ts')
  await page.getByRole('button', { name: 'Show every file' }).click()
  await expect(page.getByRole('banner')).toContainText('2 files')
})

test('opens a stash from the history tab', async ({ page, app, repo }) => {
  repo.git('stash', 'push', '-q', '-m', 'try a new answer')
  await page.goto(app.url)
  await page.getByRole('tab', { name: 'History' }).click()
  await page.getByRole('button', { name: /try a new answer/ }).click()
  await expect(page.getByRole('banner')).toContainText('1 file')
  await expect(page.getByText('export const answer = 42').first()).toBeVisible()
})
