import { expect, test } from './fixture'

test('a reload brings the page back as it was', async ({ page, app, repo }) => {
  repo.write('long.txt', `${Array.from({ length: 400 }, (_, index) => `line ${index}`).join('\n')}\n`)
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('3 files')

  // Two terminals, the first one showing.
  await page.keyboard.press('Control+`')
  await page.getByRole('button', { name: 'New terminal' }).click()
  await page.getByRole('button', { name: 'New terminal' }).click()
  await expect(page.getByRole('region', { name: 'Terminal 2' }).locator('.xterm')).toBeVisible()
  await page.getByRole('tab', { name: 'Terminal 1' }).click()

  // The stage tab, with a commit message half written.
  await page.getByRole('tab', { name: 'Stage' }).click()
  await page.getByRole('textbox', { name: 'Commit message' }).fill('half written')

  // Partway down the diff.
  const scroller = page.locator('[data-diff-view]')
  await scroller.evaluate((element) => element.scrollTo(0, 1500))
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('duck-diff:scroll') ?? '')).toContain('1500')

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Terminal 2' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Terminal 1' }).locator('.xterm')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Stage' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: 'Commit message' })).toHaveValue('half written')
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1400)
})
