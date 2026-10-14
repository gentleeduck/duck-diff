import { expect, test } from './fixture'

test('browses every file and reads one, marking the changed ones', async ({ page, app }) => {
  await page.goto(`${app.url}&view=files`)
  const tree = page.getByRole('tree', { name: 'All files' })
  await expect(tree.getByRole('treeitem', { name: /README\.md/ })).toBeVisible()
  await tree.getByRole('treeitem', { name: /app\.ts/ }).click()
  const file = page.getByRole('region', { name: 'src/app.ts' })
  await expect(file).toContainText('export const answer = 42')
  await expect(file).toContainText('Changed')
  await page.getByRole('textbox', { name: 'Filter all files' }).fill('readme')
  await expect(tree.getByRole('treeitem')).toHaveCount(1)
})
