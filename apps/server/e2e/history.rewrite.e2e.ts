import { expect, test } from './fixture'

const GRAPH = '&view=graph'

function commits(repo: { write(path: string, text: string): void; commit(message: string): string }) {
  return ['one', 'two', 'three'].map((name) => {
    repo.write(`${name}.txt`, `${name}\n`)
    return repo.commit(`add ${name}`)
  })
}

test('an interactive rebase drops one commit and rewords another', async ({ page, app, repo }) => {
  commits(repo)
  await page.goto(app.url + GRAPH)
  await page.getByRole('option', { name: /^base/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rebase interactively onto this...' }).click()
  const plan = page.getByRole('list', { name: 'Rebase plan' })
  await expect(plan.getByRole('listitem')).toHaveCount(3)
  await page.getByRole('combobox', { name: 'Action for add two' }).click()
  await page.getByRole('option', { name: 'drop' }).click()
  await page.getByRole('combobox', { name: 'Action for add three' }).click()
  await page.getByRole('option', { name: 'reword' }).click()
  await page.getByRole('textbox', { name: 'New message for add three' }).fill('add three, said better')
  await page.getByRole('button', { name: 'Start rebase' }).click()
  await expect(plan).toHaveCount(0)
  await expect.poll(() => repo.git('log', '--format=%s')).toBe('add three, said better\nadd one\nbase')
})

test('shift-click picks a range to cherry-pick, and bisect finds the commit that added a file', async ({
  page,
  app,
  repo,
}) => {
  repo.commit('work in progress')
  repo.git('checkout', '-q', '-b', 'side')
  commits(repo)
  repo.git('checkout', '-q', 'main')
  await page.goto(app.url + GRAPH)
  await page.getByRole('switch', { name: 'Every branch' }).click()
  await page.getByRole('option', { name: /^add three/ }).click()
  await page.getByRole('option', { name: /^add one/ }).click({ modifiers: ['Shift'] })
  await page
    .getByRole('toolbar', { name: 'Selected commits' })
    .getByRole('button', { name: 'Cherry-pick 3 commits' })
    .click()
  await expect.poll(() => repo.git('log', '--format=%s', '-3')).toBe('add three\nadd two\nadd one')

  await page
    .getByRole('option', { name: /^add three/ })
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Bisect' }).click()
  await page.getByRole('menuitem', { name: 'Mark as bad' }).click()
  await page.getByRole('option', { name: /^work in progress/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Bisect' }).click()
  await page.getByRole('menuitem', { name: 'Mark as good' }).click()
  const banner = page.getByRole('status', { name: 'Bisect' }).first()
  await expect(banner).toContainText('commits left')
  await banner.getByRole('button', { name: 'Run a command...' }).click()
  await page.getByRole('textbox').last().fill('test ! -f two.txt')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(banner).toContainText('First bad commit')
  await expect(banner).toContainText('add two')
  await banner.getByRole('button', { name: 'Stop bisecting' }).click()
  await expect(page.getByRole('status', { name: 'Bisect' })).toHaveCount(0)
})
