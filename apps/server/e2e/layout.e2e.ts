import { expect, test } from './fixture'

const headers = (page: import('@playwright/test').Page) =>
  page.locator('[data-diff-view] [aria-label^="Hide "], [data-diff-view] [aria-label^="Show "]')

test('the diff follows the tree order and folds with a folded folder', async ({ page, app, repo }) => {
  repo.write('src/util.ts', 'export const two = 2\n')
  await page.goto(app.url)
  await expect(headers(page)).toHaveCount(3)
  // Folders first, as the tree shows them: src/app.ts and src/util.ts before notes.txt.
  await expect(headers(page).first()).toHaveAttribute('aria-label', 'Hide src/app.ts')
  await expect(headers(page).last()).toHaveAttribute('aria-label', 'Hide notes.txt')

  await page.getByRole('tree', { name: 'Changed files' }).getByRole('treeitem', { name: /src$/ }).click()
  await expect(page.getByRole('button', { name: 'Show src/app.ts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show src/util.ts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hide notes.txt' })).toBeVisible()
})

test('files are hidden by pattern, tests first, and emptied folders leave the tree', async ({ page, app, repo }) => {
  repo.write('src/app.test.ts', 'it("works", () => {})\n')
  repo.write('docs/guide.md', '# guide\n')
  await page.goto(app.url)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: /app\.test\.ts/ })).toBeVisible()
  await page.getByRole('button', { name: 'Hide files' }).click()
  await page.getByRole('switch', { name: 'Hide Test files' }).click()
  await expect(tree.getByRole('treeitem', { name: /app\.test\.ts/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /src\/app\.test\.ts/ })).toHaveCount(0)

  await page.getByRole('textbox', { name: 'New hide pattern' }).fill('^docs/')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Hide patterns' })).toContainText('^docs/')
  await expect(tree.getByRole('treeitem', { name: /^docs/ })).toHaveCount(0)
  await expect(tree.getByRole('treeitem', { name: /guide\.md/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove ^docs/' }).click()
  await expect(tree.getByRole('treeitem', { name: /guide\.md/ })).toBeVisible()
})

test('each view hides its own left panel, and views without one show no toggle', async ({ page, app }) => {
  await page.goto(app.url)
  const panel = page.getByRole('navigation', { name: 'Changed files' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Hide changed files' }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Show changed files' }).click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Control+b')
  await expect(panel).toHaveCount(0)
  await page.keyboard.press('Control+b')
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Releases', exact: true }).click()
  await expect(page.getByRole('button', { name: /^(Hide|Show) / })).toHaveCount(0)
})
