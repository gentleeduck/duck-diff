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

  await page.getByRole('textbox', { name: 'New pattern name' }).fill('Docs')
  await page.getByRole('textbox', { name: 'New hide pattern' }).fill('^docs/')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Hide patterns' })).toContainText('^docs/')
  await expect(tree.getByRole('treeitem', { name: /^docs/ })).toHaveCount(0)
  await expect(tree.getByRole('treeitem', { name: /guide\.md/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit Docs' }).click()
  await page.getByRole('textbox', { name: 'Pattern for Docs' }).fill('^nothing/')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: /guide\.md/ })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Docs' }).click()
  await expect(page.getByRole('list', { name: 'Hide patterns' })).not.toContainText('^nothing/')
})

test('each view keeps its own left panel shown or hidden', async ({ page, app }) => {
  await page.goto(app.url)
  const changes = page.getByRole('navigation', { name: 'Changed files' })
  await changes.getByRole('button', { name: 'Hide changed files' }).click()
  await expect(changes).toHaveCount(0)
  // Another view's panel stays as it was.
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await expect(page.getByRole('tree', { name: 'All files' })).toBeVisible()
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect(changes).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Show changed files' })).toBeVisible()
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

test('scrolled to the end, the tree marks the last file even though it never reaches the top', async ({
  page,
  app,
  repo,
}) => {
  const long = Array.from({ length: 200 }, (_, i) => `export const a${i} = ${i}`)
  repo.write('a/long.ts', `${long.join('\n')}\n`)
  repo.commit('long')
  repo.write('a/long.ts', `${long.map((line) => `${line} // changed`).join('\n')}\n`)
  repo.write('z/last.ts', 'export const last = 1\n')
  await page.goto(app.url)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: /long\.ts/ })).toHaveAttribute('aria-selected', 'true')
  // Rows measured on the way can grow the page, so keep going to the end as a reader would.
  await expect
    .poll(async () => {
      await page.locator('[data-diff-view]').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      return tree.getByRole('treeitem', { name: /last\.ts/ }).getAttribute('aria-selected')
    })
    .toBe('true')
})

test('when the patterns hide every file, the tree and the diff say so and can turn them off', async ({ page, app }) => {
  await page.goto(app.url)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree).toBeVisible()
  await page.getByRole('button', { name: 'Hide files' }).click()
  await page.getByRole('textbox', { name: 'New pattern name' }).fill('Everything')
  await page.getByRole('textbox', { name: 'New hide pattern' }).fill('.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByText('All 2 changed files are hidden by your Hide files patterns.')).toHaveCount(2)
  await page.getByRole('button', { name: 'Turn the patterns off' }).first().click()
  await expect(tree.getByRole('treeitem', { name: /app\.ts/ })).toBeVisible()
  await expect(page.locator('main')).toContainText('export const answer = 42')
})

test('a full page reads in a column as wide as GitHub keeps its own, centred on a wide screen', async ({
  page,
  app,
}) => {
  await page.setViewportSize({ width: 2400, height: 900 })
  await page.goto(`${app.url}&view=insights`)
  const column = page.locator('[data-page-column]').first()
  await expect(column).toBeVisible()
  const box = await column.boundingBox()
  const main = await page.getByRole('main').boundingBox()
  if (!box || !main) throw new Error('no page column')
  expect(box.width).toBeLessThanOrEqual(1280)
  // Centred in the space the page has, not pinned to its left edge.
  expect(Math.abs(box.x - main.x - (main.width - box.width) / 2)).toBeLessThan(2)
})
