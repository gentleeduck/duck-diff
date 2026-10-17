import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('drives the page from the keyboard the way Neovim does', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.locator('main')).toContainText('export const answer = 42')
  // Its title becomes the page's tooltip once hovered, so it is found either way.
  const mode = page.locator('[title="Key mode"], [data-tip="Key mode"]')
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
  await expect(mode).toHaveText('COMMAND')
  await page.keyboard.type('ta')
  await expect(page.getByRole('list', { name: 'Matching commands' })).toContainText('Next diff tab')
  await page.getByRole('textbox', { name: 'Command line' }).fill('!echo from-ex > ex.txt')
  await page.keyboard.press('Enter')
  await expect.poll(() => existsSync(join(repo.path, 'ex.txt')), { timeout: 10_000 }).toBe(true)
  expect(readFileSync(join(repo.path, 'ex.txt'), 'utf8').trim()).toBe('from-ex')
  await expect(mode).toHaveText('TERMINAL')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(mode).toHaveText('NORMAL')

  // The keymaps picker searches every command and runs the one picked; its box is insert mode.
  await page.keyboard.press('?')
  const keymaps = page.getByRole('dialog', { name: 'Keymaps' })
  await expect(keymaps).toContainText('Pull with rebase')
  await expect(mode).toHaveText('INSERT')
  await page.keyboard.type('commit graph')
  await page.keyboard.press('Enter')
  await expect(keymaps).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Commit graph' })).toBeVisible()

  // Lists move with j, k, gg and G.
  const commits = page.getByRole('listbox', { name: 'Commits' })
  await expect(commits.getByRole('option').first()).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('j')
  await expect(commits.getByRole('option').first()).toBeFocused()
  await page.keyboard.press('G')
  await expect(commits.getByRole('option').last()).toBeFocused()
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await expect(commits.getByRole('option').first()).toBeFocused()
})

test('moves between the panels with Ctrl and a direction, as between Neovim windows, and keeps browser keys out', async ({
  page,
  app,
}) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const at = () =>
    page.evaluate(() => document.activeElement?.closest('[data-region]')?.getAttribute('data-region') ?? null)
  await page.locator('[data-region="main"]').focus()
  await page.keyboard.press('Control+h')
  await expect.poll(at).toBe('side')
  await page.keyboard.press('Control+l')
  await expect.poll(at).toBe('main')
  // The bottom panel opens on the way down to it.
  await page.keyboard.press('Control+j')
  await expect.poll(at).toBe('panel')
  await page.keyboard.press('Control+k')
  await expect.poll(at).toBe('main')
  await page.keyboard.press('Control+k')
  await expect.poll(at).toBe('top')

  // Save, print and the rest never reach the browser; reload does.
  const prevented = (key: string) =>
    page.evaluate(
      (name) =>
        new Promise<boolean>((resolve) => {
          window.addEventListener('keydown', (event) => resolve(event.defaultPrevented), { once: true })
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: name, ctrlKey: true, bubbles: true, cancelable: true }),
          )
        }),
      key,
    )
  expect(await prevented('s')).toBe(true)
  expect(await prevented('f')).toBe(true)
  expect(await prevented('r')).toBe(false)
})
