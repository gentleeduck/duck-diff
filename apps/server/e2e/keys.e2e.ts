import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('drives the page with a few plain keys', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.locator('main')).toContainText('export const answer = 42')

  // j steps to a change and s stages it.
  await page.keyboard.press('j')
  await page.keyboard.press('s')
  await expect.poll(() => repo.git('diff', '--cached', '--name-only')).toMatch(/^(src\/app\.ts|notes\.txt)$/)

  // t flips the layout; typing in a text box keeps the letters there.
  await expect(page.locator('[data-layout="split"]')).toBeAttached()
  await page.keyboard.press('t')
  await expect(page.locator('[data-layout="unified"]')).toBeAttached()
  await page.keyboard.press('/')
  await expect(page.locator('#file-filter')).toBeFocused()
  await page.keyboard.type('t')
  await expect(page.locator('#file-filter')).toHaveValue('t')
  await expect(page.locator('[data-layout="unified"]')).toBeAttached()
  await page.keyboard.press('Escape')
  await expect(page.locator('#file-filter')).not.toBeFocused()

  // ? lists them all.
  await page.keyboard.press('?')
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(shortcuts).toContainText('Next change')
  await page.keyboard.press('Escape')
  await expect(shortcuts).toBeHidden()

  // Ctrl P searches.
  await page.keyboard.press('Control+p')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  // Arrows walk a list once it has focus, or from nothing focused.
  await page.goto(`${app.url}&view=graph`)
  const commits = page.getByRole('listbox', { name: 'Commits' })
  await expect(commits.getByRole('option').first()).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('ArrowDown')
  await expect(commits.getByRole('option').first()).toBeFocused()
  await page.keyboard.press('End')
  await expect(commits.getByRole('option').last()).toBeFocused()
  await page.keyboard.press('Home')
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
