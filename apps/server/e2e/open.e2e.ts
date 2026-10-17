import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixture'

test('with no Neovim attached, Open starts VS Code at the line and leaves the terminals alone', async ({
  page,
  app,
  repo,
}) => {
  await page.goto(app.url)
  await expect(page.locator('main')).toContainText('export const answer = 42')
  const answer = page.waitForResponse((response) => response.url().endsWith('/api/open'))
  await page.locator('[data-diff-view]').getByRole('button', { name: 'Open', exact: true }).first().click()
  expect(await (await answer).json()).toEqual({ how: 'editor', command: 'code' })
  const opened = () => (existsSync(app.opened) ? readFileSync(app.opened, 'utf8').trim().split('\n') : [])
  await expect.poll(opened, { timeout: 10_000 }).toEqual(['-g', `${join(repo.path, 'src/app.ts')}:1`])
  await expect(page.getByText('Opened in VS Code')).toBeVisible()
  await expect(page.getByText('src/app.ts, line 1')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Terminal 1' })).toHaveCount(0)
})
