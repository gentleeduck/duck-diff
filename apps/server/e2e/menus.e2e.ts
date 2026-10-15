import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('stages a file from its right-click menu in the changes tree', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await tree.getByRole('treeitem', { name: /app\.ts/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Stage file' }).click()
  await expect.poll(() => repo.git('diff', '--cached', '--name-only').trim()).toBe('src/app.ts')
})

test('switches branch and opens a commit from right-click menus in the graph', async ({ page, app, repo }) => {
  repo.git('stash', '-u')
  repo.git('branch', 'side')
  await page.goto(`${app.url}&view=graph`)
  await page.getByRole('region', { name: 'Branches' }).getByText('side', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Switch to side' }).click()
  await expect.poll(() => repo.git('branch', '--show-current').trim()).toBe('side')

  await page.getByRole('listbox', { name: 'Commits' }).getByRole('option').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Show changes' }).click()
  await expect(page).toHaveURL(/\/changes/)
  await expect(page.getByRole('banner')).toContainText('file')
})
