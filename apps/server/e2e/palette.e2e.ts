import { expect, test } from './fixture'

test('file: searches every file, previews the highlighted one, and opens it', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').fill('file: readme')
  const result = dialog.getByRole('option', { name: /README\.md/ })
  await expect(result).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(dialog).toContainText('# demo')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/view=files/)
  await expect(page.getByRole('region', { name: 'README.md' })).toBeVisible()
})

test('> narrows to commands and the scope chips fill the prefix in', async ({ page, app }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '>' }).click()
  await expect(dialog.getByRole('combobox')).toHaveValue('>')
  await dialog.getByRole('combobox').fill('> split')
  await expect(dialog.getByRole('option', { name: 'Split view' })).toBeVisible()
  await expect(dialog.getByRole('option')).toHaveCount(1)
})
