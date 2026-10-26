import { expect, test } from './fixture'

test('a merge stops on three conflicts, each resolved its own way, and continues', async ({ page, app, repo }) => {
  repo.commit('work in progress')
  // Edits far enough apart that git keeps them as three blocks.
  const list = (side: string) => `${['1', '2', '3'].map((n) => `${n}${side}\nkeep\nkeep\nkeep\nkeep`).join('\n')}\n`
  repo.write('list.txt', list(''))
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('list.txt', list(' feature'))
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('list.txt', list(' main'))
  repo.commit('main')
  expect(() => repo.git('merge', 'feature')).toThrow()

  await page.goto(app.url)
  await page.getByRole('button', { name: 'Resolve list.txt' }).first().click()
  const editor = page.getByRole('region', { name: 'Merge list.txt' })
  await expect(editor).toContainText('3 of 3 left')
  await expect(page.getByRole('banner')).toContainText('Merging feature into main')

  await editor
    .getByRole('region', { name: 'Current change, conflict 1' })
    .getByRole('button', { name: 'Accept current' })
    .click()
  await editor
    .getByRole('region', { name: 'Incoming change, conflict 2' })
    .getByRole('button', { name: 'Accept incoming' })
    .click()
  const third = editor.getByRole('region', { name: 'Result, conflict 3' })
  await third.getByRole('button', { name: 'Edit conflict 3' }).click()
  await third.getByRole('textbox', { name: 'Text for conflict 3' }).fill('3 by hand')
  await third.getByRole('button', { name: 'Use this text' }).click()
  await expect(editor).toContainText('All resolved')
  await editor.getByRole('button', { name: 'Mark resolved' }).click()

  // The last file done, the page says so and finishes the merge from where you are.
  await expect(page.getByRole('main')).toContainText('Every conflict is resolved.')
  await expect.poll(() => repo.git('ls-files', '-u')).toBe('')
  const keep = '\nkeep\nkeep\nkeep\nkeep'
  expect(repo.git('show', ':list.txt')).toBe(`1 main${keep}\n2 feature${keep}\n3 by hand${keep}`)

  await page.getByRole('main').getByRole('button', { name: 'Continue' }).click()
  await expect.poll(() => repo.git('log', '-1', '--format=%P').split(' ').length).toBe(2)
})

test('a resolved file reopens to its conflict while the merge is still open', async ({ page, app, repo }) => {
  repo.commit('work in progress')
  repo.write('list.txt', 'one\nkeep\n')
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('list.txt', 'one feature\nkeep\n')
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('list.txt', 'one main\nkeep\n')
  repo.commit('main')
  expect(() => repo.git('merge', 'feature')).toThrow()

  await page.goto(app.url)
  await page.getByRole('button', { name: 'Resolve list.txt' }).first().click()
  const editor = page.getByRole('region', { name: 'Merge list.txt' })
  await editor.getByRole('button', { name: 'All incoming' }).click()
  await editor.getByRole('button', { name: 'Mark resolved' }).click()
  await expect(page.getByRole('main')).toContainText('Every conflict is resolved.')
  await expect.poll(() => repo.git('ls-files', '-u')).toBe('')

  await page.getByRole('button', { name: 'Reopen list.txt' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen' }).click()
  await expect(editor).toContainText('1 of 1 left')
  expect(repo.git('ls-files', '-u')).not.toBe('')
  await editor
    .getByRole('region', { name: 'Current change, conflict 1' })
    .getByRole('button', { name: 'Accept current' })
    .click()
  await editor.getByRole('button', { name: 'Mark resolved' }).click()
  await expect.poll(() => repo.git('show', ':list.txt')).toBe('one main\nkeep')
})

test("a conflict met in the page's terminal shows in the panel at once", async ({ page, app, repo }) => {
  repo.commit('work in progress')
  repo.write('list.txt', 'one\nkeep\n')
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('list.txt', 'one feature\nkeep\n')
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('list.txt', 'one main\nkeep\n')
  repo.commit('main')

  await page.goto(app.url)
  await page.keyboard.press('Control+`')
  await page.getByRole('button', { name: 'New terminal' }).click()
  await page.getByRole('region', { name: 'Terminal 1' }).locator('.xterm').click()
  await page.keyboard.type('git merge feature\n')

  // The panel turns to its Merge tab, and the status bar says so on every page.
  await expect(page.getByRole('tab', { name: 'Merge' })).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 })
  const tab = page.getByRole('region', { name: 'Merge in progress' })
  await expect(tab).toContainText('Merging feature into main')
  await expect(page.getByRole('contentinfo')).toContainText('Merging feature into main, 1 file to resolve')
  await tab.getByRole('button', { name: 'Resolve list.txt' }).click()
  await expect(page.getByRole('region', { name: 'Merge list.txt' })).toBeVisible()
  // The sides are headed once, over every file, with their commits.
  await expect(page.getByRole('main')).toContainText('Current change')
  await expect(page.getByRole('main')).toContainText(repo.git('rev-parse', '--short', 'feature').trim())
})

test('the merge page blames each side and lists the commits behind it', async ({ page, app, repo }) => {
  const commitAs = (author: string, message: string) => {
    repo.git('add', '-A')
    repo.git('commit', '-q', '--author', author, '-m', message)
  }
  repo.commit('work in progress')
  repo.write('list.txt', 'one\nkeep\n')
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.write('list.txt', 'one feature\nkeep\n')
  commitAs('Bob Incoming <bob@duck.local>', 'Louder one')
  repo.git('checkout', '-q', 'main')
  repo.write('list.txt', 'one main\nkeep\n')
  commitAs('Ada Current <ada@duck.local>', 'Quieter one')
  expect(() => repo.git('merge', 'feature')).toThrow()

  await page.goto(app.url)
  await page.getByRole('button', { name: 'Resolve list.txt' }).first().click()
  const editor = page.getByRole('region', { name: 'Merge list.txt' })
  await expect(editor).toContainText('1 of 1 left')
  await page.keyboard.press('b')
  const incoming = editor.getByRole('region', { name: 'Incoming change, conflict 1' })
  await expect(incoming).toContainText('Bob Incoming')
  await expect(editor.getByRole('region', { name: 'Current change, conflict 1' })).toContainText('Ada Current')

  await editor.getByRole('button', { name: "History: each side's commits to the file" }).click()
  const history = editor.getByRole('region', { name: 'History of list.txt' })
  await expect(history.getByRole('region', { name: 'Current change history' })).toContainText('Quieter one')
  await expect(history.getByRole('region', { name: 'Incoming change history' })).toContainText('Louder one')

  // Both stay on across a reload, as the rest of the page does.
  await page.reload()
  await expect(incoming).toContainText('Bob Incoming')
  await expect(history).toContainText('Louder one')
})
