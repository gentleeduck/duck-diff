import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('stages one change by hovering its line', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.getByRole('banner')).toContainText('2 files')
  // The toolbar follows pointer movement and the diff can re-render under the pointer while it highlights, which
  // hides the toolbar again, so hover and click retry together.
  const stage = page.getByRole('button', { name: 'Stage change' })
  await expect(async () => {
    await page.mouse.move(0, 0)
    await page.getByText('export const answer = 42').first().hover()
    await stage.click({ timeout: 1000 })
  }).toPass()
  await expect(page.getByRole('banner')).toContainText('1 file')
  expect(repo.git('diff', '--cached')).toContain('+export const answer = 42')
})

test('discards a file after confirming and brings it back with undo', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.getByRole('button', { name: 'Discard file' }).first().click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.getByRole('banner')).toContainText('1 file')
  expect(repo.git('diff', '--name-only')).toBe('')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('banner')).toContainText('2 files')
  expect(repo.git('diff', '--name-only')).toBe('src/app.ts')
})

test('stages two lines of a five-line hunk from a drag, leaving the rest unstaged', async ({ page, app, repo }) => {
  repo.write('lines.txt', 'keep\n')
  repo.commit('lines')
  const added = ['one', 'two', 'three', 'four', 'five'].map((word) => `the line called ${word}`)
  repo.write('lines.txt', `keep\n${added.join('\n')}\n`)
  await page.goto(app.url + UNSTAGED)
  const line = (word: string) =>
    page.locator('[data-side="additions"] [data-code]').filter({ hasText: `called ${word}` })
  await expect(line('three')).toBeVisible()
  // Past the start of the line, where the line's own toolbar sits while hovered.
  const from = await line('two').boundingBox()
  const to = await line('three').boundingBox()
  if (!from || !to) throw new Error('lines not on screen')
  await page.mouse.move(from.x + 80, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 120, to.y + to.height / 2, { steps: 5 })
  await page.mouse.up()

  const bar = page.getByRole('toolbar', { name: 'Selected 2 lines' })
  await expect(bar).toBeVisible()
  await page.keyboard.press('s')
  await expect(bar).toHaveCount(0)
  await expect
    .poll(() => repo.git('diff', '--cached', '--', 'lines.txt'))
    .toContain('+the line called two\n+the line called three')
  const staged = repo.git('diff', '--cached', '--', 'lines.txt')
  expect(staged).not.toContain('called one')
  expect(staged).not.toContain('called four')
  expect(repo.git('diff', '--', 'lines.txt')).toContain('+the line called one')
})
