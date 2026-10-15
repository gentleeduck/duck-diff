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

test('back returns the diff to where it was scrolled, and a view switch keeps it too', async ({ page, app, repo }) => {
  repo.write('long.ts', Array.from({ length: 400 }, (_, i) => `export const line${i} = ${i}`).join('\n'))
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('3 files')
  const diff = page.locator('[data-diff-view]')
  const top = () => diff.evaluate((element) => element.scrollTop)
  await expect.poll(() => diff.evaluate((element) => element.scrollHeight)).toBeGreaterThan(5000)
  // Scrolls until the diff has finished loading and stays put.
  await expect(async () => {
    await diff.evaluate((element) => {
      element.scrollTop = 3000
    })
    await page.waitForTimeout(300)
    expect(await top()).toBe(3000)
  }).toPass()
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await expect(page.getByRole('tree', { name: 'All files' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect.poll(top).toBe(3000)

  await page.getByRole('button', { name: 'Commit graph', exact: true }).click()
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect.poll(top).toBe(3000)
})
