import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('stages a file, commits it from the commit box, then branches', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.getByRole('button', { name: 'Stage file' }).first().click()
  const box = page.getByRole('form', { name: 'Commit' })
  await expect(box.getByRole('textbox', { name: 'Commit message' })).toHaveAttribute('placeholder', /1 staged file/)
  await box.getByRole('textbox', { name: 'Commit message' }).fill('answer the question')
  await box.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect(page.getByText('Committed')).toBeVisible()
  expect(repo.git('log', '-1', '--format=%s')).toBe('answer the question')

  await page.getByRole('button', { name: 'Branch', exact: true }).click()
  await page.keyboard.type('feat/next')
  await page.getByRole('option', { name: /Create feat\/next/ }).click()
  await expect(page.getByText('Created and switched to feat/next')).toBeVisible()
  expect(repo.git('branch', '--show-current')).toBe('feat/next')
})
