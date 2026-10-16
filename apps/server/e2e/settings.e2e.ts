import type { Page } from '@playwright/test'
import { expect, test } from './fixture'

async function addPattern(page: Page, name: string, pattern: string) {
  await page.getByRole('button', { name: 'Hide files' }).click()
  await page.getByRole('textbox', { name: 'New pattern name' }).fill(name)
  await page.getByRole('textbox', { name: 'New hide pattern' }).fill(pattern)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Hide patterns' })).toContainText(pattern)
  await page.keyboard.press('Escape')
}

async function patterns(page: Page) {
  await page.getByRole('button', { name: 'Hide files' }).click()
  const list = page.getByRole('list', { name: 'Hide patterns' })
  await expect(list).toBeVisible()
  const text = await list.innerText()
  await page.keyboard.press('Escape')
  return text
}

test('a hide pattern stays after a reload', async ({ page, app }) => {
  await page.goto(app.url)
  await addPattern(page, 'Docs', '^docs/')
  await page.reload()
  expect(await patterns(page)).toContain('^docs/')
})

test('a page open elsewhere picks up a change instead of writing over it', async ({ page, app, context }) => {
  await page.goto(app.url)
  const other = await context.newPage()
  await other.goto(app.url)
  await addPattern(page, 'Docs', '^docs/')
  // The other page shows it without a reload, and its own change keeps it.
  expect(await patterns(other)).toContain('^docs/')
  await other.getByRole('button', { name: 'Hide files' }).click()
  await other.getByRole('switch', { name: 'Hide Test files' }).click()
  await other.keyboard.press('Escape')
  await page.reload()
  const after = await patterns(page)
  expect(after).toContain('^docs/')
})
