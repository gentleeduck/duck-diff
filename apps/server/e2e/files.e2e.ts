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
