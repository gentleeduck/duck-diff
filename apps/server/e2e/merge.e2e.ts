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

  await editor.getByRole('region', { name: 'Ours, conflict 1' }).getByRole('button', { name: 'Accept ours' }).click()
  await editor
    .getByRole('region', { name: 'Theirs, conflict 2' })
    .getByRole('button', { name: 'Accept theirs' })
    .click()
  const third = editor.getByRole('region', { name: 'Result, conflict 3' })
  await third.getByRole('button', { name: 'Edit conflict 3' }).click()
  await third.getByRole('textbox', { name: 'Text for conflict 3' }).fill('3 by hand')
  await third.getByRole('button', { name: 'Use this text' }).click()
  await expect(editor).toContainText('All resolved')
  await editor.getByRole('button', { name: 'Mark resolved' }).click()

  await expect(page).not.toHaveURL(/view=merge/)
  await expect.poll(() => repo.git('ls-files', '-u')).toBe('')
  const keep = '\nkeep\nkeep\nkeep\nkeep'
  expect(repo.git('show', ':list.txt')).toBe(`1 main${keep}\n2 feature${keep}\n3 by hand${keep}`)

  await page.getByRole('status').getByRole('button', { name: 'Continue' }).click()
  await expect.poll(() => repo.git('log', '-1', '--format=%P').split(' ').length).toBe(2)
})
