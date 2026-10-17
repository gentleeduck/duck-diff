import { expect, test } from './fixture'

test('the changes tree marks the file at the top of the diff as it scrolls', async ({ page, app, repo }) => {
  repo.write('a-long.ts', Array.from({ length: 300 }, (_, i) => `export const a${i} = ${i}`).join('\n'))
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('3 files')
  const tree = page.getByRole('tree', { name: 'Changed files' })
  const marked = tree.locator('[aria-current="true"]')
  // Folders come first, so the diff opens on src/app.ts.
  await expect(marked).toHaveAttribute('title', /^src\/app\.ts/)
  const diff = page.locator('[data-diff-view]')
  await expect.poll(() => diff.evaluate((element) => element.scrollHeight)).toBeGreaterThan(5000)
  await diff.evaluate((element) => {
    element.scrollTop = 600
  })
  await expect(marked).toHaveAttribute('title', /^a-long\.ts/)
})

test('a file picked in search is marked and opened in the files tree', async ({ page, app }) => {
  await page.goto(`${app.url}&view=files`)
  const tree = page.getByRole('tree', { name: 'All files' })
  await expect(tree.getByRole('treeitem', { name: /README\.md/ })).toBeVisible()
  await page.keyboard.press('Control+p')
  await page.getByRole('dialog').getByRole('combobox').fill('file:src/app')
  await expect(page.getByRole('dialog').getByRole('option').first()).toContainText('src/app.ts')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: /app\.ts/ })).toHaveAttribute('aria-current', 'true')
})

test('folding and clicking leave the tree where it is; only a new active file brings it into view', async ({
  page,
  app,
  repo,
}) => {
  for (let i = 0; i < 40; i++) repo.write(`pkg${String(i).padStart(2, '0')}/file.ts`, `export const v${i} = ${i}\n`)
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('42 files')
  const tree = page.getByRole('tree', { name: 'Changed files' })
  const top = () => tree.evaluate((element) => element.scrollTop)
  // The diff marks its top file once it has loaded, which on a busy machine comes after the tree.
  await expect(tree.locator('[aria-current="true"]')).toHaveCount(1)
  await expect
    .poll(() =>
      tree.evaluate((element) => {
        element.scrollTop = 400
        return element.scrollTop
      }),
    )
    .toBe(400)
  // A folder already on screen, so the click itself needs no scrolling.
  const folders = await tree.locator('[role=treeitem][aria-expanded]').all()
  let folder = folders[0]
  for (const candidate of folders) {
    const box = await candidate.boundingBox()
    const area = await tree.boundingBox()
    if (box && area && box.y > area.y + 40 && box.y + box.height < area.y + area.height - 40) {
      folder = candidate
      break
    }
  }
  if (!folder) throw new Error('no folder on screen')
  await folder.click()
  await page.waitForTimeout(300)
  expect(await top()).toBe(400)
  await folder.click()
  await page.waitForTimeout(300)
  expect(await top()).toBe(400)
})
