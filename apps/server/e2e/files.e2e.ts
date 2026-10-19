import { expect, test } from './fixture'

test('browses every file and reads one, marking the changed ones', async ({ page, app }) => {
  await page.goto(`${app.url}&view=files`)
  const tree = page.getByRole('tree', { name: 'All files' })
  await expect(tree.getByRole('treeitem', { name: /README\.md/ })).toBeVisible()
  // Folders start closed.
  await expect(tree.getByRole('treeitem', { name: /app\.ts/ })).toHaveCount(0)
  await tree.getByRole('treeitem', { name: 'src' }).click()
  await tree.getByRole('treeitem', { name: /app\.ts/ }).click()
  const file = page.getByRole('region', { name: 'src/app.ts' })
  await expect(file).toContainText('export const answer = 42')
  await expect(file).toContainText('Changed')
  await page.getByRole('textbox', { name: 'Filter all files' }).fill('readme')
  await expect(tree.getByRole('treeitem')).toHaveCount(1)
})

test('opens files without an extension, in Files and in the diff', async ({ page, app, repo }) => {
  repo.write('Makefile', 'build:\n\techo duck\n')
  repo.write('bin/run', '#!/bin/sh\necho run\n')
  await page.goto(`${app.url}&view=files`)
  const tree = page.getByRole('tree', { name: 'All files' })
  await tree.getByRole('treeitem', { name: /Makefile/ }).click()
  await expect(page.getByRole('region', { name: 'Makefile' })).toContainText('echo duck')
  await tree.getByRole('treeitem', { name: 'bin' }).click()
  await tree.getByRole('treeitem', { name: /run/ }).click()
  await expect(page.getByRole('region', { name: 'bin/run' })).toContainText('echo run')
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect(page.locator('main')).toContainText('echo duck')
})

test('an empty file says so, in the diff and in Files', async ({ page, app, repo }) => {
  repo.write('cat', '')
  await page.goto(app.url)
  await expect(page.locator('main')).toContainText('Empty file')
  await page.goto(`${app.url}&view=files&file=cat`)
  await expect(page.getByRole('region', { name: 'cat', exact: true })).toContainText('This file is empty.')
})

test('a README reads in a column of its own width, centred, however wide the window', async ({ page, app }) => {
  await page.setViewportSize({ width: 2400, height: 900 })
  await page.goto(`${app.url}&view=files`)
  await page
    .getByRole('tree', { name: 'All files' })
    .getByRole('treeitem', { name: /README\.md/ })
    .click()
  const prose = page.getByRole('region', { name: 'README.md' }).getByRole('article')
  await expect(prose).toContainText('demo')
  const box = await prose.boundingBox()
  const pane = await page.getByRole('region', { name: 'README.md' }).boundingBox()
  if (!box || !pane) throw new Error('no preview')
  expect(box.width).toBeLessThanOrEqual(980)
  expect(Math.abs(box.x - pane.x - (pane.width - box.width) / 2)).toBeLessThan(8)
})

test('opens the README with the file tree hidden', async ({ page, app, browser }) => {
  await page.goto(`${app.url}&view=files`)
  await expect(page.getByRole('tree', { name: 'All files' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+b')
  await expect(page.getByRole('tree', { name: 'All files' })).toBeHidden()
  // A new page with the tree still hidden opens the README all the same.
  const fresh = await (await browser.newContext()).newPage()
  await fresh.goto(`${app.url}&view=files`)
  await expect(fresh.getByRole('region', { name: 'README.md' })).toContainText('demo')
})
