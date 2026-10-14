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
