import { expect, test } from './fixture'

test('lists the changed files and shows the diff', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const tree = page.getByRole('navigation', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: 'app.ts' })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: 'notes.txt' })).toBeVisible()
  await expect(page.locator('main')).toContainText('export const answer = 42')
})

test('switching to staged shows only staged changes', async ({ page, app, repo }) => {
  repo.git('add', 'README.md')
  await page.goto(app.url)
  await page.getByRole('button', { name: /Compare to working tree/ }).click()
  await page.getByRole('option', { name: 'Staged' }).click()
  await expect(page.getByRole('banner')).toContainText('HEAD')
  await expect(page.getByRole('banner')).toContainText('staged')
  await expect(page.getByRole('banner')).toContainText('0 files')
})

test('edits on disk appear without reloading', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await expect(page.getByRole('contentinfo')).toContainText('Live')
  repo.write('README.md', '# demo\nmore\n')
  await expect(page.getByRole('banner')).toContainText('3 files')
})

test('t switches between split and stacked', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.locator('main')).toContainText('export const answer = 42')
  await expect(page.locator('[data-unified]')).toHaveCount(0)
  await page.keyboard.press('t')
  await expect(page.locator('[data-unified]').first()).toBeAttached()
})

test('the palette jumps to a file', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.locator('main')).toContainText('export const answer = 42')
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Jump to a file').fill('notes')
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toContainText('fresh file')
})
