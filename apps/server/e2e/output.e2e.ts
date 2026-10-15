import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

test('shows the commands a commit ran and what its hook printed', async ({ page, app, repo }) => {
  repo.write('.git/hooks/pre-commit', '#!/bin/sh\necho "pre-commit hook says hi"\n')
  chmodSync(join(repo.path, '.git/hooks/pre-commit'), 0o755)
  await page.goto(app.url + UNSTAGED)
  await expect(page.getByRole('banner')).toContainText('2 files')
  await page.getByRole('button', { name: 'Stage file' }).first().click()
  const box = page.getByRole('form', { name: 'Commit' })
  await box.getByRole('textbox', { name: 'Commit message' }).fill('with a hook')
  await box.getByRole('button', { name: 'Commit', exact: true }).click()
  await page.getByRole('button', { name: 'Show output' }).click()

  const actions = page.getByRole('list', { name: 'Actions' })
  await expect(actions).toContainText('Commit')
  await expect(actions).toContainText('git commit --file=-')
  await expect(page.getByRole('region', { name: 'Output of Commit' }).locator('.xterm')).toBeVisible()
  const output = await page.evaluate(async () => {
    const [job] = (await (await fetch('/api/jobs')).json()) as { id: string }[]
    return (await fetch(`/api/jobs/${job?.id}/output`)).text()
  })
  expect(output).toContain('git commit --file=-')
  expect(output).toContain('pre-commit hook says hi')

  await page.keyboard.press('Control+`')
  await expect(page.getByRole('region', { name: 'Bottom panel' })).toBeHidden()
})
