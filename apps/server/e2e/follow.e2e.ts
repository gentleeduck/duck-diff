import { expect, test } from './fixture'

test('the changes tree marks the file at the top of the diff as it scrolls', async ({ page, app, repo }) => {
  repo.write('a-long.ts', Array.from({ length: 300 }, (_, i) => `export const a${i} = ${i}`).join('\n'))
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('3 files')
  const tree = page.getByRole('tree', { name: 'Changed files' })
  const marked = tree.locator('[aria-current="true"]')
  // Folders come first, so the diff opens on src/app.ts.
  await expect(marked).toHaveAttribute('title', 'src/app.ts')
  const diff = page.locator('[data-diff-view]')
  await expect.poll(() => diff.evaluate((element) => element.scrollHeight)).toBeGreaterThan(5000)
  await diff.evaluate((element) => {
    element.scrollTop = 600
  })
  await expect(marked).toHaveAttribute('title', 'a-long.ts')
})

test('a file picked in search is marked and opened in the files tree', async ({ page, app }) => {
  await page.goto(`${app.url}&view=files`)
  const tree = page.getByRole('tree', { name: 'All files' })
  await expect(tree.getByRole('treeitem', { name: /README\.md/ })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByRole('dialog').getByRole('combobox').fill('file:src/app')
  await expect(page.getByRole('dialog').getByRole('option').first()).toContainText('src/app.ts')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: /app\.ts/ })).toHaveAttribute('aria-current', 'true')
})
