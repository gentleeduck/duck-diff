import { expect, test } from './fixture'

test('keeps a line comment across reloads and follows its line when code above moves', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  // Same retry as staging: the diff can re-render under the pointer while it highlights.
  const button = page.getByRole('button', { name: 'Comment on line' })
  await expect(async () => {
    await page.mouse.move(0, 0)
    await page.getByText('export const name = "duck"').last().hover()
    await button.click({ timeout: 1000 })
  }).toPass()
  await page.getByRole('textbox', { name: 'New comment' }).fill('Is duck the right default?')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await expect(page.getByText('Is duck the right default?')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Is duck the right default?')).toBeVisible()

  repo.write('src/app.ts', '// header\nexport const answer = 42\nexport const name = "duck"\n')
  await page.getByRole('button', { name: /Comments/ }).click()
  await expect(page.getByRole('dialog').getByText('Line 3')).toBeVisible()
})

test('drags from a line comment button over the next line to comment on both', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const first = page.getByText('export const answer = 42').last()
  const second = page.getByText('export const name = "duck"').last()
  const button = page.getByRole('button', { name: 'Comment on line' })
  await expect(async () => {
    await page.mouse.move(0, 0)
    await first.hover()
    const box = await button.boundingBox({ timeout: 1000 })
    if (!box) throw new Error('no comment button')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await second.hover()
    await page.mouse.up()
    await expect(page.getByText('Commenting on lines 1 to 2')).toBeVisible({ timeout: 1000 })
  }).toPass()
  // Dragging lines selects whole lines, never text under the pointer.
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed ?? true)).toBe(true)
  await page.getByRole('textbox', { name: 'New comment' }).fill('Both lines')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await expect(page.getByText('Lines 1 to 2')).toBeVisible()
})

test('selecting words offers a comment on exactly them, highlighted before and after saving', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const code = page.locator('[data-side="additions"][data-line="1"] [data-code]').filter({ hasText: 'answer = 42' })
  await expect(code).toContainText('export const answer = 42')
  // Colors re-render the line's pieces, which would drop a selection made before they land.
  await expect(code.locator('.tok').first()).toBeVisible()
  // Select "answer" by its characters, as a mouse drag would.
  await code.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let at = 0
    const range = document.createRange()
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      if (at <= 13 && 13 <= at + text.length) range.setStart(node, 13 - at)
      if (at <= 19 && 19 <= at + text.length) range.setEnd(node, 19 - at)
      at += text.length
    }
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  })
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(page.getByText('Commenting on')).toContainText('answer')
  await expect(page.locator('[data-pick]')).toHaveText(['answer'])
  await page.getByRole('textbox', { name: 'New comment' }).fill('Rename this')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await expect(page.getByText('Rename this')).toBeVisible()
  await expect(page.locator('[data-pick]')).toHaveText(['answer'])
})
