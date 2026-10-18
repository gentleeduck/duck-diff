import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRepo } from '@duck-diff/testing'
import { expect, openedPage, test } from './fixture'

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
    // A loaded CI runner can take longer than the default 8s to finish the update.
    await expect.poll(() => repo.git('status', '--porcelain'), { timeout: 20_000 }).toBe('')
  } finally {
    lib.cleanup()
  }
})

test('a worktree is added from the sidebar, opens on its own page, and is removed', async ({ page, app, repo }) => {
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
    await trees.getByRole('button', { name: `Open ${folder}`, exact: true }).click()
    const tab = await openedPage(page.context(), app.browsed)
    // The new server took the token into its cookie and dropped it from the url.
    await expect(tab).toHaveURL(/\/changes/)
    await expect(tab).not.toHaveURL(/token=/)
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

test('a separate checkout kept in .claude/worktrees is listed as one and opens from its row', async ({
  page,
  app,
  repo,
}) => {
  const copy = join(repo.path, '.claude', 'worktrees', 'copy')
  mkdirSync(copy, { recursive: true })
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: copy,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'D',
        GIT_AUTHOR_EMAIL: 'd@d',
        GIT_COMMITTER_NAME: 'D',
        GIT_COMMITTER_EMAIL: 'd@d',
      },
    })
  git('init', '-q', '-b', 'synced')
  writeFileSync(join(copy, 'c.txt'), 'c\n')
  git('add', '.')
  git('commit', '-qm', 'synced copy')

  await page.goto(`${app.url}&view=graph`)
  const trees = page.getByRole('region', { name: 'Worktrees' })
  await expect(trees).toContainText('synced')
  await expect(trees).toContainText('separate')
  await trees.getByRole('button', { name: `Open ${copy}`, exact: true }).click()
  const tab = await openedPage(page.context(), app.browsed)
  await expect(tab.getByRole('banner')).toContainText('synced')
  await tab.close()
})

test('the repo switcher adds another repository and opens it on its own page', async ({ page, app }) => {
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
    await entry.first().click()
    const tab = await openedPage(page.context(), app.browsed)
    await expect(tab.getByRole('banner')).toContainText('elsewhere')
    await tab.close()
  } finally {
    other.cleanup()
  }
})

test('a long branch name truncates before its tag, which sits right beside it', async ({ page, app, repo }) => {
  repo.commit('work in progress')
  const branch = 'someone/iry-134-catalogue-4-variants-with-a-long-tail'
  repo.git('checkout', '-q', '-b', branch)
  await page.goto(`${app.url}&view=graph`)
  const row = page.getByRole('region', { name: 'Worktrees' }).getByRole('button', { name: /open here$/ })
  const tag = row.getByText('here', { exact: true })
  await expect(tag).toBeVisible()
  const [name, badge, box] = await Promise.all([
    row.getByText(branch).boundingBox(),
    tag.boundingBox(),
    row.boundingBox(),
  ])
  if (!name || !badge || !box) throw new Error('nothing to measure')
  expect(name.x + name.width).toBeLessThanOrEqual(badge.x)
  expect(badge.x + badge.width).toBeLessThanOrEqual(box.x + box.width)
  expect(await tag.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
})
