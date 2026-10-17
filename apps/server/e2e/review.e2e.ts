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
  // Saved once the box closes; a reload before that keeps the comment still being written.
  await expect(page.getByRole('textbox', { name: 'New comment' })).toBeHidden()
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

// Screen points for a character span in a code line, for dragging the mouse over it.
async function span(code: import('@playwright/test').Locator, from: number, to: number) {
  return code.evaluate(
    (element, { start, end }) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let at = 0
      const range = document.createRange()
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        if (at <= start && start <= at + text.length) range.setStart(node, start - at)
        if (at <= end && end <= at + text.length) range.setEnd(node, end - at)
        at += text.length
      }
      const box = range.getBoundingClientRect()
      return { x1: box.left + 1, x2: box.right - 1, y: box.top + box.height / 2 }
    },
    { start: from, end: to },
  )
}

test('dragging over words opens a comment on exactly them, highlighted before and after saving', async ({
  page,
  app,
}) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const code = page.locator('[data-side="additions"][data-line="1"] [data-code]').filter({ hasText: 'answer = 42' })
  await expect(code.locator('.tok').first()).toBeVisible()
  const { x1, x2, y } = await span(code, 13, 19)
  await page.mouse.move(x1, y)
  await page.mouse.down()
  await page.mouse.move(x2, y, { steps: 5 })
  // The highlight covers exactly the dragged words: one block, as wide as "answer".
  const pick = page.locator('[data-pick]')
  await expect(pick).toHaveCount(1)
  expect(Math.abs(((await pick.boundingBox())?.width ?? 0) - (x2 - x1 + 2))).toBeLessThan(3)
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('answer')
  await page.mouse.up()
  await expect(page.getByText('Commenting on')).toContainText('answer')
  await page.getByRole('textbox', { name: 'New comment' }).fill('Rename this')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await expect(page.getByText('Rename this')).toBeVisible()
  await expect(pick).toHaveCount(1)
})

test('dragging across lines selects them whole and opens a comment on release', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const first = page.locator('[data-side="additions"][data-line="1"] [data-code]').filter({ hasText: 'answer = 42' })
  const second = page.locator('[data-side="additions"][data-line="2"] [data-code]').filter({ hasText: 'name' })
  await expect(first.locator('.tok').first()).toBeVisible()
  const start = await span(first, 7, 12)
  const end = await span(second, 7, 12)
  await page.mouse.move(start.x1, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x2, end.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByText('Commenting on lines 1 to 2')).toBeVisible()
  await expect(page.locator('[data-pick]')).toHaveCount(0)
})

test('a line picked for a comment keeps its diff colour, the selection tinted over it', async ({ page, app }) => {
  await page.goto(app.url)
  const added = page.locator('[data-side="additions"][data-line]').filter({ hasText: 'answer = 42' }).first()
  await expect(added).toBeVisible()
  const before = await added.evaluate((row) => getComputedStyle(row).backgroundColor)
  const button = page.getByRole('button', { name: 'Comment on line' })
  await expect(async () => {
    await page.mouse.move(0, 0)
    await added.hover()
    await button.click({ timeout: 1000 })
  }).toPass()
  await expect(page.getByRole('textbox', { name: 'New comment' })).toBeVisible()
  const picked = await added.evaluate((row) => {
    const style = getComputedStyle(row)
    return { color: style.backgroundColor, image: style.backgroundImage }
  })
  expect(picked.color).toBe(before)
  expect(picked.image).toContain('linear-gradient')
})
