import { expect, test } from './fixture'

test('clicking a name in the diff lists where it is defined and used, and opens the file at that line', async ({
  page,
  app,
  repo,
}) => {
  repo.write('src/use.ts', "import { answer } from './app'\nexport const twice = answer * 2\n")
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('3 files')
  const code = page.locator('[data-side="additions"] [data-code]').filter({ hasText: 'twice = answer' }).first()
  await expect(code.locator('.tok').first()).toBeVisible()
  await code.getByText('answer', { exact: true }).last().click()

  const panel = page.getByRole('complementary', { name: 'Symbol answer' })
  await expect(panel).toBeVisible()
  const definitions = panel.getByRole('region', { name: 'Definitions' })
  await expect(definitions).toContainText('src/app.ts')
  await expect(panel.getByRole('region', { name: 'Imports' })).toContainText('src/use.ts')
  await expect(panel.getByRole('region', { name: 'References' })).toContainText('twice')

  await definitions.getByRole('button').first().click()
  await expect(page).toHaveURL(/view=files/)
  await expect(page).toHaveURL(/line=1/)
  await expect(page.getByRole('region', { name: 'src/app.ts' })).toContainText('export const answer = 42')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).not.toHaveURL(/view=files/)
})
