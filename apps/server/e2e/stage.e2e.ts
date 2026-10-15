import { expect, test } from './fixture'

test('stages and unstages files from the stage panel, one by one and all at once', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await page.getByRole('tab', { name: 'Stage' }).click()
  const staged = page.getByRole('listbox', { name: 'Staged changes' })
  const changes = page.getByRole('listbox', { name: 'Changes', exact: true })
  await expect(changes.getByRole('option')).toHaveCount(2)
  await expect(staged.getByRole('option')).toHaveCount(0)

  await changes.getByRole('option', { name: /app\.ts/ }).hover()
  await changes.getByRole('button', { name: 'Stage src/app.ts' }).click()
  await expect(staged.getByRole('option', { name: /app\.ts/ })).toBeVisible()
  expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('src/app.ts')

  await page.getByRole('button', { name: 'Stage all', exact: true }).click()
  await expect(staged.getByRole('option')).toHaveCount(2)
  await expect(changes.getByRole('option')).toHaveCount(0)

  await page.getByRole('button', { name: 'Unstage all' }).click()
  await expect(changes.getByRole('option')).toHaveCount(2)
  expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('')
})
