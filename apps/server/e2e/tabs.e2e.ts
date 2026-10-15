import { expect, test } from './fixture'

test('diffs open in tabs beside the working tree, which stays first and cannot close', async ({ page, app, repo }) => {
  repo.write('later.txt', 'later\n')
  repo.git('add', 'later.txt')
  repo.git('commit', '-q', '-m', 'add later', '--', 'later.txt')
  await page.goto(app.url)
  const tabs = page.getByRole('tablist', { name: 'Open diffs' })
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await expect(tabs.getByRole('tab').first()).toContainText('Working tree')
  await expect(tabs.getByRole('button', { name: /^Close/ })).toHaveCount(0)
  await expect(page.getByRole('banner')).toContainText('2 files')

  await page.goto(`${app.url}&view=graph`)
  await page
    .getByRole('listbox', { name: 'Commits' })
    .getByRole('option', { name: /add later/ })
    .click()
  await page.getByRole('complementary', { name: 'Commit' }).getByRole('button', { name: 'Show changes' }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await expect(tabs.getByRole('tab', { selected: true })).toContainText('add later')
  await expect(page.getByRole('banner')).toContainText('1 file')

  // The working tree is still there, as it was.
  await tabs.getByRole('tab', { name: /Working tree/ }).click()
  await expect(page.getByRole('banner')).toContainText('2 files')
  await expect(tabs.getByRole('tab')).toHaveCount(2)

  // Tabs come back with the page.
  await page.reload()
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await tabs.getByRole('tab', { name: /add later/ }).click()
  await expect(page.getByRole('banner')).toContainText('1 file')
  await tabs.getByRole('button', { name: /^Close .*add later/ }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await expect(page.getByRole('banner')).toContainText('2 files')
})
