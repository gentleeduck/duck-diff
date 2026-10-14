import { expect, test } from './fixture'

test('shows the commit graph and opens a commit with its changed files', async ({ page, app, repo }) => {
  repo.commit('edit')
  repo.git('switch', '-q', '-c', 'feature', 'HEAD~1')
  repo.write('feature.txt', 'new\n')
  repo.commit('add feature file')
  repo.git('switch', '-q', 'main')
  repo.git('merge', '-q', '--no-ff', '-m', 'merge feature', 'feature')
  await page.goto(`${app.url}&view=graph`)
  const commits = page.getByRole('listbox', { name: 'Commits' })
  await expect(commits.getByRole('option')).toHaveCount(4)
  await expect(commits.getByRole('option').first()).toContainText('merge feature')
  await commits.getByRole('option', { name: /add feature file/ }).click()
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await expect(panel).toContainText('add feature file')
  await expect(panel.getByRole('button', { name: /feature\.txt/ })).toBeVisible()
  await panel.getByRole('button', { name: 'Show changes' }).click()
  await expect(page.getByRole('banner')).toContainText('1 file')
})

test('switches views from the rail and keeps the view in the url', async ({ page, app }) => {
  await page.goto(app.url)
  await page.getByRole('button', { name: 'Commit graph' }).click()
  await expect(page).toHaveURL(/view=graph/)
  await expect(page.getByRole('banner')).toContainText('Commit graph')
  await page.goBack()
  await expect(page.getByRole('banner')).toContainText('working tree')
})
