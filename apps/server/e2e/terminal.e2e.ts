import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixture'

const waitForFile = async (path: string) => {
  await expect.poll(() => existsSync(path), { timeout: 10_000 }).toBe(true)
  return readFileSync(path, 'utf8').trim()
}

test('runs a real shell in the repo that survives a reload', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await expect(page.getByRole('button', { name: 'Output' })).toBeVisible()
  await page.keyboard.press('Control+`')
  await page.getByRole('button', { name: 'New terminal' }).click()
  const pane = page.getByRole('region', { name: 'Terminal 1' })
  await expect(pane.locator('.xterm')).toBeVisible()
  await pane.locator('.xterm').click()
  await page.keyboard.type('echo "$PWD $TERM" > from-terminal.txt\n')
  expect(await waitForFile(join(repo.path, 'from-terminal.txt'))).toBe(`${repo.path} xterm-256color`)

  // Hidden and shown again, the terminal has the keyboard straight away.
  await page.keyboard.press('Control+`')
  await page.keyboard.press('Control+`')
  await page.keyboard.type('echo back > reopened.txt\n')
  expect(await waitForFile(join(repo.path, 'reopened.txt'))).toBe('back')

  // Page keys stay out of the shell: s would stage, j would move.
  await page.keyboard.type('echo sj > keys.txt\n')
  expect(await waitForFile(join(repo.path, 'keys.txt'))).toBe('sj')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Output' })).toBeVisible()
  await page.keyboard.press('Control+`')
  await page.getByRole('tab', { name: 'Terminal 1' }).click()
  await page.getByRole('region', { name: 'Terminal 1' }).locator('.xterm').click()
  await page.keyboard.type('echo again > after-reload.txt\n')
  expect(await waitForFile(join(repo.path, 'after-reload.txt'))).toBe('again')

  await page.getByRole('button', { name: 'Close Terminal 1' }).click()
  await expect(page.getByRole('tab', { name: 'Terminal 1' })).toBeHidden()
  const left = await page.evaluate(async () => (await fetch('/api/terminals')).json())
  expect(left).toEqual([])
})
