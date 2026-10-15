import { expect, test } from './fixture'

test('shows the commit graph and opens a commit with its changed files', async ({ page, app, repo }) => {
  repo.commit('edit')
  repo.git('switch', '-q', '-c', 'feature', 'HEAD~1')
  repo.write('feature.txt', 'new\n')
  repo.commit('add feature file')
  repo.git('switch', '-q', 'main')
  repo.git('merge', '-q', '--no-ff', '-m', 'merge feature', 'feature')
  await page.goto(`${app.url}&view=graph`)
  const commits = page.getByRole('listbox', { name: 'Commits' })
  await expect(commits.getByRole('option')).toHaveCount(4)
  await expect(commits.getByRole('option').first()).toContainText('merge feature')
  await commits.getByRole('option', { name: /add feature file/ }).click()
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await expect(panel).toContainText('add feature file')
  await expect(panel.getByRole('button', { name: /feature\.txt/ })).toBeVisible()
  await panel.getByRole('button', { name: 'Show changes' }).click()
  await expect(page.getByRole('banner')).toContainText('1 file')
})

test('compares a commit with HEAD', async ({ page, app, repo }) => {
  repo.commit('edit')
  repo.write('later.txt', 'later\n')
  repo.commit('add later')
  await page.goto(`${app.url}&view=graph`)
  await page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: /base/ }).click()
  await page.getByRole('complementary', { name: 'Commit' }).getByRole('button', { name: 'Compare with HEAD' }).click()
  await expect(page.getByRole('banner')).toContainText('3 files')
})

test('switches views from the rail and keeps the view in the url', async ({ page, app }) => {
  await page.goto(app.url)
  await page.getByRole('button', { name: 'Commit graph' }).click()
  await expect(page).toHaveURL(/\/graph/)
  await expect(page.getByRole('banner')).toContainText('Commit graph')
  await page.goBack()
  await expect(page.getByRole('banner')).toContainText('working tree')
})

test('starts a branch at an older commit and checks one out detached', async ({ page, app, repo }) => {
  repo.commit('edit')
  await page.goto(`${app.url}&view=graph`)
  const commits = page.getByRole('listbox', { name: 'Commits' })
  await commits.getByRole('option').nth(1).click()
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await panel.getByRole('button', { name: 'New branch here' }).click()
  await page.getByPlaceholder('feat/name').fill('older')
  await page.getByRole('button', { name: 'Create and switch' }).click()
  await expect.poll(() => repo.git('branch', '--show-current').trim()).toBe('older')
  await expect.poll(() => repo.git('rev-parse', 'HEAD').trim()).toBe(repo.git('rev-parse', 'main~1').trim())
  await commits.getByRole('option').first().click()
  await panel.getByRole('button', { name: 'Checkout' }).click()
  await expect.poll(() => repo.git('branch', '--show-current').trim()).toBe('')
})

test('number keys switch views, and diff keys stay inert outside the changes view', async ({ page, app, repo }) => {
  await page.goto(app.url)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.keyboard.press('2')
  await expect(page).toHaveURL(/\/graph/)
  await page.keyboard.press('j')
  await page.keyboard.press('x')
  await page.keyboard.press('3')
  await expect(page).toHaveURL(/\/files/)
  expect(repo.git('status', '--porcelain')).not.toBe('')
  await page.keyboard.press('1')
  await expect(page.getByRole('banner')).toContainText('2 files')
})

test('finds commits by message and steps through the matches', async ({ page, app, repo }) => {
  repo.commit('fix the parser')
  repo.commit('unrelated chore')
  repo.commit('fix the lexer')
  await page.goto(`${app.url}&view=graph`)
  const find = page.getByRole('textbox', { name: 'Find commit' })
  await find.fill('fix the')
  await expect(page.getByRole('banner')).toContainText('1 of 2')
  await find.press('Enter')
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await expect(panel).toContainText('fix the lexer')
  await find.press('Enter')
  await expect(page.getByRole('banner')).toContainText('2 of 2')
  await expect(panel).toContainText('fix the parser')
})

test("a file in a commit's list opens the whole commit, scrolled to that file", async ({ page, app, repo }) => {
  repo.commit('edit')
  for (const name of ['a', 'b', 'c'])
    repo.write(`many/${name}.ts`, `${Array(80).fill(`export const ${name} = 1`).join('\n')}\n`)
  repo.commit('add three files')
  await page.goto(`${app.url}&view=graph`)
  await page
    .getByRole('listbox', { name: 'Commits' })
    .getByRole('option', { name: /add three files/ })
    .click()
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await panel.getByRole('button', { name: /many\/c\.ts/ }).click()
  await expect(page).toHaveURL(/path=many%2Fc\.ts/)
  await expect(page.getByRole('banner')).toContainText('3 files')
  // The changes tree marks the file the diff is showing at its top.
  await expect(page.getByRole('tree', { name: 'Changed files' }).locator('[aria-current="true"]')).toHaveAttribute(
    'title',
    /many\/c\.ts/,
  )
})

test('a side list keeps its place when the page is left and opened again', async ({ page, app, repo }) => {
  for (let i = 0; i < 80; i++) repo.git('branch', `topic/${String(i).padStart(2, '0')}`)
  await page.goto(`${app.url}&view=graph`)
  const list = page.locator('[aria-label="Branches and tags"]').locator('.overflow-y-auto, .overflow-auto').first()
  await expect(list).toBeVisible()
  await expect
    .poll(() =>
      list.evaluate((element) => {
        element.scrollTop = 600
        element.dispatchEvent(new Event('scroll'))
        return element.scrollTop
      }),
    )
    .toBeGreaterThan(300)
  const kept = await list.evaluate((element) => element.scrollTop)
  await page.getByRole('button', { name: 'Releases', exact: true }).click()
  await page.getByRole('button', { name: 'Commit graph', exact: true }).click()
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(kept)
})
