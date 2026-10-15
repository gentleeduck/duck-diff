import { expect, test } from './fixture'

test('steps back and forward through views, files and the diff like a browser', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  const tree = page.getByRole('tree', { name: 'All files' })
  await tree.getByRole('treeitem', { name: 'src' }).click()
  await tree.getByRole('treeitem', { name: /app\.ts/ }).click()
  await expect(page).toHaveURL(/file=src%2Fapp\.ts/)
  await expect(page.getByRole('region', { name: 'src/app.ts' })).toBeVisible()

  // README was picked by the page, not by a click, so one step back leaves Files.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/view=files/)
  await expect(page.getByRole('region', { name: 'README.md' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).not.toHaveURL(/view=files/)
  await expect(page.getByRole('banner')).toContainText('2 files')

  await page.keyboard.press('Alt+ArrowRight')
  await expect(page.getByRole('region', { name: 'README.md' })).toBeVisible()
  await page.getByRole('button', { name: 'Forward' }).click()
  await expect(page.getByRole('region', { name: 'src/app.ts' })).toBeVisible()
})
