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

  // It belongs to the code views: gone on other pages, back with the diff.
  await page.getByRole('button', { name: 'Pull requests', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect(panel).toBeVisible()
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

test('a language server tells two functions of the same name apart', async ({ page, app, repo }) => {
  repo.write('src/a.ts', 'export function load() {\n  return 1\n}\n')
  repo.write('src/b.ts', 'export function load() {\n  return 2\n}\n')
  repo.write('src/use.ts', "import { load } from './b'\nexport const x = load()\n")
  await page.goto(app.url)
  const code = page.locator('[data-side="additions"] [data-code]').filter({ hasText: 'x = load()' }).first()
  await expect(code.locator('.tok').first()).toBeVisible()
  await code.getByText('load', { exact: true }).click()

  const panel = page.getByRole('complementary', { name: 'Symbol load' })
  await expect(panel).toContainText('server')
  const definitions = panel.getByRole('region', { name: 'Definitions' })
  await expect(definitions).toContainText('src/b.ts')
  await expect(definitions).not.toContainText('src/a.ts')
  await expect(panel).not.toContainText('src/a.ts')
  await expect(panel.getByRole('region', { name: 'Imports' })).toContainText('src/use.ts')

  await page.keyboard.press('Escape')
  await code.getByText('load', { exact: true }).hover()
  const card = page.getByRole('dialog', { name: 'About load' })
  await expect(card).toContainText('load(): number')
  await card.getByRole('button', { name: /References/ }).click()
  await expect(card.getByRole('list', { name: 'References' })).toContainText('src/b.ts:1')
  await expect(card.getByRole('list', { name: 'References' })).not.toContainText('src/a.ts')
  await page.keyboard.press('Escape')

  await code.getByText('load', { exact: true }).click({ modifiers: ['ControlOrMeta'] })
  await expect(page).toHaveURL(/view=files/)
  await expect(page.getByRole('region', { name: 'src/b.ts' })).toContainText('return 2')
})
