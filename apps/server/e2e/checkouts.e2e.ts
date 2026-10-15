import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo } from '@duck-diff/testing'
import { expect, test } from './fixture'

test('a moved submodule reads as old to new commit with the commits between', async ({ page, app, repo }) => {
  const lib = createRepo()
  try {
    lib.write('lib.txt', '1\n')
    lib.commit('lib one')
    repo.commit('work in progress')
    repo.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib.path, 'vendor/lib')
    repo.commit('add lib')
    lib.write('lib.txt', '2\n')
    lib.commit('lib two')
    repo.git('-C', 'vendor/lib', 'pull', '-q', 'origin', 'main')

    await page.goto(app.url)
    const summary = page.getByRole('region', { name: 'Submodule vendor/lib' })
    await expect(summary).toContainText('Submodule moved from')
    await expect(summary).toContainText('lib two')
    await expect(summary).not.toContainText('lib one')

    await page.getByRole('button', { name: 'Commit graph' }).click()
    const modules = page.getByRole('region', { name: 'Submodules' })
    await expect(modules).toContainText('vendor/lib')
    await modules.getByText('vendor/lib').hover()
    await modules.getByRole('button', { name: 'Update vendor/lib to the recorded commit' }).click()
    await expect.poll(() => repo.git('status', '--porcelain')).toBe('')
  } finally {
    lib.cleanup()
  }
})

test('a worktree is added from the sidebar, opens in its own tab, and is removed', async ({ page, app, repo }) => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'duck-diff-e2e-wt-')))
  try {
    repo.commit('work in progress')
    const folder = join(outside, 'next')
    await page.goto(`${app.url}&view=graph`)
    const trees = page.getByRole('region', { name: 'Worktrees' })
    await trees.getByRole('button', { name: 'Add a worktree' }).click()
    await page.getByRole('textbox', { name: /^Branch/ }).fill('next')
    await page.getByRole('textbox', { name: 'Folder' }).fill(folder)
    await page.getByRole('button', { name: 'Add worktree', exact: true }).click()
    await expect(trees).toContainText(folder)
    expect(repo.git('worktree', 'list')).toContain('[next]')

    await trees.getByText(folder).hover()
    const [tab] = await Promise.all([
      page.context().waitForEvent('page'),
      trees.getByRole('button', { name: `Open ${folder} in a new tab` }).click(),
    ])
    await expect(tab).toHaveURL(/token=/)
    await expect(tab.getByRole('banner')).toContainText('next')
    await tab.close()

    await trees.getByText(folder).hover()
    await trees.getByRole('button', { name: `Remove the worktree at ${folder}` }).click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(trees).not.toContainText(folder)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('the repo switcher adds another repository and opens it in its own tab', async ({ page, app }) => {
  const other = createRepo()
  try {
    other.write('other.txt', 'other\n')
    other.commit('other base')
    other.git('checkout', '-q', '-b', 'elsewhere')
    await page.goto(app.url)
    await page.getByRole('button', { name: 'Repositories' }).click()
    const list = page.getByRole('list', { name: 'Repositories' })
    await expect(list.getByRole('button')).toHaveCount(1)
    await page.getByRole('textbox', { name: 'Repository folder' }).fill(other.path)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const entry = list.getByRole('button', { name: new RegExp(other.path.split('/').pop() ?? '') })
    await expect(entry.first()).toBeVisible()
    const [tab] = await Promise.all([page.context().waitForEvent('page'), entry.first().click()])
    await expect(tab.getByRole('banner')).toContainText('elsewhere')
    await tab.close()
  } finally {
    other.cleanup()
  }
})
