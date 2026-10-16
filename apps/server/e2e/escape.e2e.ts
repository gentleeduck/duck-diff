import { expect, test } from './fixture'

// Esc backs out of whatever the page has open, the way it does in the user's editor.

test('Esc closes the symbol panel opened from the diff', async ({ page, app }) => {
  await page.goto(app.url)
  const code = page.locator('[data-side="additions"] [data-code]').filter({ hasText: 'answer = 42' }).first()
  await expect(code.locator('.tok').first()).toBeVisible()
  await code.getByText('answer', { exact: true }).last().dblclick()
  const panel = page.getByRole('complementary', { name: 'Symbol answer' })
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('Esc closes a comment being written, whether the box has the keyboard or not', async ({ page, app }) => {
  await page.goto(app.url)
  const button = page.getByRole('button', { name: 'Comment on line' })
  const box = page.getByRole('textbox', { name: 'New comment' })
  const open = async () => {
    await expect(async () => {
      await page.mouse.move(0, 0)
      await page.getByText('export const name = "duck"').last().hover()
      await button.click({ timeout: 1000 })
    }).toPass()
    await expect(box).toBeVisible()
  }
  await open()
  await box.fill('half a thought')
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)

  await open()
  await page.getByRole('banner').click()
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
})

test('Esc while dragging over lines drops the selection instead of commenting', async ({ page, app }) => {
  await page.goto(app.url)
  const first = page.getByText('export const answer = 42').last()
  const second = page.getByText('export const name = "duck"').last()
  const button = page.getByRole('button', { name: 'Comment on line' })
  await expect(async () => {
    await page.mouse.move(0, 0)
    await first.hover()
    const at = await button.boundingBox({ timeout: 1000 })
    if (!at) throw new Error('no comment button')
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
  }).toPass()
  await page.mouse.down()
  await second.hover()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(300)
  await expect(page.getByRole('textbox', { name: 'New comment' })).toHaveCount(0)
})

test('Esc while dragging over code text drops the selection', async ({ page, app }) => {
  await page.goto(app.url)
  const first = page.locator('[data-side="additions"] [data-code]').filter({ hasText: 'answer = 42' }).first()
  const second = page.locator('[data-side="additions"] [data-code]').filter({ hasText: 'name = "duck"' }).first()
  await expect(first.locator('.tok').first()).toBeVisible()
  const box = page.getByRole('textbox', { name: 'New comment' })
  const drag = async (cancel: boolean) => {
    const from = await first.boundingBox()
    const to = await second.boundingBox()
    if (!from || !to) throw new Error('no code lines')
    await page.mouse.move(from.x + 4, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + 60, to.y + to.height / 2, { steps: 5 })
    if (cancel) await page.keyboard.press('Escape')
    await page.mouse.up()
  }
  await drag(true)
  await page.waitForTimeout(300)
  await expect(box).toHaveCount(0)
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)

  // Without Esc the same drag opens a comment, so the drag above did reach the code.
  await drag(false)
  await expect(box).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
})
