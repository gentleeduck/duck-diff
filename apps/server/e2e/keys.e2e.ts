import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('drives the page from the keyboard the way Neovim does', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.locator('main')).toContainText('export const answer = 42')
  const mode = page.getByTitle('Key mode')
  await expect(mode).toHaveText('NORMAL')

  // The leader waits, shows what can follow, then runs the chord.
  await page.keyboard.press('Space')
  const which = page.getByRole('complementary', { name: 'Keys that can follow' })
  await expect(which).toContainText('+search')
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await expect(page.getByRole('heading', { name: 'Commit graph' })).toBeVisible()
  await page.keyboard.press('Space')
  await page.keyboard.press('g')
  await page.keyboard.press('s')
  await expect(page.locator('main')).toContainText('export const answer = 42')

  // The first change is staged with the same keys as gitsigns.
  await page.keyboard.type(' hs')
  await expect.poll(() => repo.git('diff', '--cached', '--name-only')).toMatch(/^(src\/app\.ts|notes\.txt)$/)

  // :! runs in a terminal, <Esc><Esc> leaves it, and the page keys work again.
  await page.keyboard.press(':')
  await page.getByRole('textbox', { name: 'Command line' }).fill('!echo from-ex > ex.txt')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(repo.path, 'ex.txt')), { timeout: 10_000 }).toBe(true)
  expect(readFileSync(join(repo.path, 'ex.txt'), 'utf8').trim()).toBe('from-ex')
  await expect(mode).toHaveText('TERMINAL')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(mode).toHaveText('NORMAL')

  // Keymaps come from the same list, and typing in a box is insert mode.
  await page.keyboard.press('?')
  const keymaps = page.getByRole('dialog', { name: 'Keymaps' })
  await expect(keymaps).toContainText('Pull with rebase')
  await keymaps.getByRole('textbox', { name: 'Filter keymaps' }).focus()
  await expect(mode).toHaveText('INSERT')
  await page.keyboard.press('Escape')
  await expect(keymaps).toBeHidden()
})
