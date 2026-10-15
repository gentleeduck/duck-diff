import { expect, test } from './fixture'

test('lists the changed files and shows the diff', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: /app\.ts/ })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: /notes\.txt/ })).toBeVisible()
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
  await expect(page.locator('[data-layout="split"]')).toBeAttached()
  await page.keyboard.press('t')
  await expect(page.locator('[data-layout="unified"]')).toBeAttached()
})

test('the palette jumps to a file', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.locator('main')).toContainText('export const answer = 42')
  await page.keyboard.press('Control+k')
  await page.getByRole('dialog').getByRole('combobox').fill('notes')
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toContainText('fresh file')
})

test('a file header and its gaps all act: unchanged lines open above and below, the file folds, Viewed folds it', async ({
  page,
  app,
  repo,
}) => {
  const lines = Array.from({ length: 80 }, (_, i) => `export const line${i} = ${i}`)
  repo.write('long.ts', `${lines.join('\n')}\n`)
  repo.commit('long')
  lines[40] = 'export const line40 = 4000'
  repo.write('long.ts', `${lines.join('\n')}\n`)
  await page.goto(app.url)
  const main = page.locator('main')
  await expect(main).toContainText('line40 = 4000')

  // The lines above the change, then the lines after it.
  const above = page.getByRole('button', { name: 'Show 37 unchanged lines' })
  await above.click()
  await expect(main).toContainText('line10 = 10')
  await expect(above).toHaveCount(0)
  // Rows are drawn near the screen only, so the lower gap comes into the page once scrolled to.
  await page.locator('[data-diff-view]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const below = page.getByRole('button', { name: /Show 3\d unchanged lines/ })
  await below.click()
  await expect(below).toHaveCount(0)
  await page.locator('[data-diff-view]').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(main).toContainText('line79 = 79')

  // Folding hides the file's body; opening brings it back.
  await page.getByRole('button', { name: 'Hide long.ts' }).click()
  await expect(main).not.toContainText('line5 = 5')
  // Reopened, it starts from its first lines; how far down the screen reaches does not matter.
  await page.getByRole('button', { name: 'Show long.ts' }).click()
  await expect(main).toContainText('line5 = 5')

  // Viewed folds it too, and unticking opens it again.
  const viewed = page.getByRole('checkbox', { name: 'Viewed' }).first()
  await page.getByRole('button', { name: 'Hide long.ts' }).waitFor()
  await page.locator('[data-diff-view]').getByText('long.ts', { exact: true }).first().hover()
  await viewed.click()
  await expect(page.getByRole('button', { name: 'Show long.ts' })).toBeVisible()
})

test('a viewed file that changes again opens and counts as not viewed', async ({ page, app, repo }) => {
  await page.goto(app.url)
  const main = page.getByRole('main')
  await expect(main).toContainText('answer = 42')
  await page.locator('[data-diff-view]').getByText('src/app.ts', { exact: true }).first().hover()
  await page.getByRole('checkbox', { name: 'Viewed' }).first().click()
  await expect(page.getByRole('button', { name: 'Show src/app.ts' })).toBeVisible()

  repo.write('src/app.ts', 'export const answer = 43\nexport const name = "duck"\n')
  await expect(main).toContainText('answer = 43')
  await expect(page.getByRole('button', { name: 'Hide src/app.ts' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Viewed' }).first()).toHaveAttribute('aria-checked', 'false')
})

test('Show unchanged lines opens every gap in the diff', async ({ page, app, repo }) => {
  const lines = Array.from({ length: 80 }, (_, i) => `export const line${i} = ${i}`)
  repo.write('long.ts', `${lines.join('\n')}\n`)
  repo.commit('long')
  lines[40] = 'export const line40 = 4000'
  repo.write('long.ts', `${lines.join('\n')}\n`)
  await page.goto(app.url)
  const main = page.locator('main')
  await expect(main).toContainText('line40 = 4000')
  await expect(page.getByRole('button', { name: /Show \d+ unchanged lines/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Diff settings' }).click()
  await page.getByRole('switch', { name: 'Show unchanged lines' }).click()
  await page.keyboard.press('Escape')
  await expect(main).toContainText('line10 = 10')
  await expect(page.getByRole('button', { name: /Show \d+ unchanged lines/ })).toHaveCount(0)
})

test('counts the files viewed and goes to the next one not viewed', async ({ page, app }) => {
  await page.goto(app.url)
  const progress = page.getByRole('button', { name: /viewed/ }).filter({ hasText: '/ 2 viewed' })
  await expect(progress).toContainText('0 / 2 viewed')
  await page.locator('[data-diff-view]').getByText('notes.txt', { exact: true }).first().hover()
  await page.getByRole('checkbox', { name: 'Viewed' }).first().click()
  await expect(progress).toContainText('1 / 2 viewed')
  await progress.click()
  await expect(
    page.getByRole('tree', { name: 'Changed files' }).getByRole('treeitem', { name: /app\.ts/ }),
  ).toHaveAttribute('aria-selected', 'true')
})

test('folding or viewing a long file read halfway brings the next file up after it', async ({ page, app, repo }) => {
  const long = Array.from({ length: 300 }, (_, i) => `export const a${i} = ${i}`)
  repo.write('a/long.ts', `${long.join('\n')}\n`)
  repo.commit('long')
  repo.write('a/long.ts', `${long.map((line) => `${line} // changed`).join('\n')}\n`)
  repo.write('z/next.ts', 'export const next = 1\n')
  // A long file after it, so the page stays taller than where the reader was once the first one folds.
  repo.write('zz/after.ts', `${Array.from({ length: 400 }, (_, i) => `export const z${i} = ${i}`).join('\n')}\n`)
  await page.goto(app.url)
  const scroller = page.locator('[data-diff-view]')
  const nextHeader = page.locator('[data-diff-view]').getByRole('button', { name: 'Hide z/next.ts' })
  const readHalfway = async () => {
    await scroller.evaluate((element) => {
      element.scrollTop = 2500
    })
    await expect(nextHeader).toHaveCount(0)
    // The pinned header takes over once the page has drawn the new place.
    await expect(page.getByRole('button', { name: 'Hide a/long.ts' })).toHaveCount(1)
  }

  await readHalfway()
  await page.getByRole('button', { name: 'Hide a/long.ts' }).first().click()
  await expect(nextHeader).toBeVisible()
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeLessThan(200)

  await page.getByRole('button', { name: 'Show a/long.ts' }).first().click()
  await readHalfway()
  await page.getByRole('checkbox', { name: 'Viewed' }).first().click()
  await expect(nextHeader).toBeVisible()
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeLessThan(200)
})

test('blame shows who changed each line of the new side, from the header or <leader>hb', async ({ page, app }) => {
  await page.goto(app.url)
  const main = page.locator('main')
  await expect(main).toContainText('export const answer = 42')
  await page.locator('[data-diff-view]').getByText('src/app.ts', { exact: true }).first().hover()
  await page.getByRole('button', { name: 'Blame: who changed each line' }).first().click()
  // The unchanged second line was last changed by the base commit; the edited first is not committed yet.
  await expect(page.locator('[data-diff-view]').getByText('Duck Test').first()).toBeVisible()
  await page.keyboard.type(' hb')
  await expect(page.locator('[data-diff-view]').getByText('Duck Test')).toHaveCount(0)
})
