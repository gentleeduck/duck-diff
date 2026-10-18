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

  // The panel comes back open on the same terminal.
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('region', { name: 'Terminal 1' }).locator('.xterm').click()
  await page.keyboard.type('echo again > after-reload.txt\n')
  expect(await waitForFile(join(repo.path, 'after-reload.txt'))).toBe('again')

  await page.getByRole('button', { name: 'Close Terminal 1' }).click()
  await expect(page.getByRole('tab', { name: 'Terminal 1' })).toBeHidden()
  const left = await page.evaluate(async () => (await fetch('/api/terminals')).json())
  expect(left).toEqual([])
})

test('a terminal behind another panel tab keeps its size, so the shell does not redraw', async ({ page, app }) => {
  const sizes: string[] = []
  page.on('websocket', (socket) =>
    socket.on('framesent', (frame) => {
      if (typeof frame.payload === 'string' && frame.payload.includes('"resize"')) sizes.push(frame.payload)
    }),
  )
  await page.goto(app.url)
  await expect(page.getByRole('button', { name: 'Output' })).toBeVisible()
  await page.keyboard.press('Control+`')
  await page.getByRole('button', { name: 'New terminal' }).click()
  await expect(page.getByRole('region', { name: 'Terminal 1' }).locator('.xterm')).toBeVisible()
  await expect.poll(() => sizes.length).toBeGreaterThan(0)
  const shown = sizes.at(-1)
  await page.getByRole('tab', { name: /Output/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: 'Terminal 1' }).click()
  await page.waitForTimeout(300)
  expect(new Set(sizes)).toEqual(new Set([shown]))
})

test('works as a desktop terminal: Ctrl+C interrupts, Ctrl+Z suspends, and the clipboard keys copy and paste', async ({
  page,
  app,
  repo,
}) => {
  // Job control is Linux only for now; macOS keeps the terminal as it was.
  test.skip(process.platform === 'darwin', 'no job control on macOS yet')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(app.url)
  await expect(page.getByRole('button', { name: 'Output' })).toBeVisible()
  await page.keyboard.press('Control+`')
  await page.getByRole('button', { name: 'New terminal' }).click()
  const pane = page.getByRole('region', { name: 'Terminal 1' })
  await pane.locator('.xterm').click()

  // The shell owns the terminal, so Ctrl+C stops what runs and Ctrl+Z suspends it.
  await page.keyboard.type('sleep 30; touch not-interrupted\n')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+c')
  await page.keyboard.type('echo $? > interrupted.txt\n')
  expect(await waitForFile(join(repo.path, 'interrupted.txt'))).toBe('130')
  expect(existsSync(join(repo.path, 'not-interrupted'))).toBe(false)
  await page.keyboard.type('sleep 30\n')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+z')
  await page.keyboard.type('jobs > jobs.txt; kill -9 %1\n')
  expect(await waitForFile(join(repo.path, 'jobs.txt'))).toContain('Stopped')

  await page.evaluate(() => navigator.clipboard.writeText('echo pasted > pasted.txt'))
  await page.keyboard.press('Control+v')
  await page.keyboard.press('Enter')
  expect(await waitForFile(join(repo.path, 'pasted.txt'))).toBe('pasted')

  await page.keyboard.type('clear; echo copy-me\n')
  await page.waitForTimeout(500)
  const screen = await pane.locator('.xterm-screen').boundingBox()
  if (!screen) throw new Error('no terminal on screen')
  await page.mouse.move(screen.x + 2, screen.y + 2)
  await page.mouse.down()
  await page.mouse.move(screen.x + screen.width - 4, screen.y + 60, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.press('Control+Shift+c')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('copy-me')
})
