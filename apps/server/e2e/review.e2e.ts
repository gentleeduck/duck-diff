import { expect, test } from './fixture'

test('keeps a line comment across reloads and follows its line when code above moves', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  // Same retry as staging: the diff can re-render under the pointer while it highlights.
  const button = page.getByRole('button', { name: 'Comment on line' })
  await expect(async () => {
    await page.mouse.move(0, 0)
    await page.getByText('export const name = "duck"').last().hover()
    await button.click({ timeout: 1000 })
  }).toPass()
  await page.getByRole('textbox', { name: 'New comment' }).fill('Is duck the right default?')
  await page.getByRole('button', { name: 'Save comment' }).click()
  await expect(page.getByText('Is duck the right default?')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Is duck the right default?')).toBeVisible()

  repo.write('src/app.ts', '// header\nexport const answer = 42\nexport const name = "duck"\n')
  await page.getByRole('button', { name: /Comments/ }).click()
  await expect(page.getByRole('dialog').getByText('Line 3')).toBeVisible()
})
