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

test('stashes the changes, then pops the stash back from the graph', async ({ page, app, repo }) => {
  await page.goto(app.url + UNSTAGED)
  await expect(page.getByRole('banner')).toContainText('2 files')
  const box = page.getByRole('form', { name: 'Commit' })
  await box.getByRole('textbox', { name: 'Commit message' }).fill('half done')
  await box.getByRole('button', { name: 'More commit actions' }).click()
  await page.getByRole('button', { name: 'Stash every change' }).click()
  await expect(page.getByText('Stashed your changes')).toBeVisible()
  expect(repo.git('status', '--porcelain')).toBe('')

  await page.getByRole('button', { name: 'Commit graph' }).click()
  const stashes = page.getByRole('region', { name: 'Stashes' })
  await expect(stashes).toContainText('half done')
  await stashes.getByText('half done').hover()
  await stashes.getByRole('button', { name: 'Pop stash@{0}' }).click()
  await expect(page.getByText('Popped stash@{0}')).toBeVisible()
  expect(repo.git('stash', 'list')).toBe('')
  expect(repo.git('status', '--porcelain')).not.toBe('')
})
