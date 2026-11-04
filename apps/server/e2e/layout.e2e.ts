import { expect, test } from './fixture'

const headers = (page: import('@playwright/test').Page) =>
  page.locator('[data-diff-view] [aria-label^="Hide "], [data-diff-view] [aria-label^="Show "]')

test('the diff follows the tree order and folds with a folded folder', async ({ page, app, repo }) => {
  repo.write('src/util.ts', 'export const two = 2\n')
  await page.goto(app.url)
  await expect(headers(page)).toHaveCount(3)
  // Folders first, as the tree shows them: src/app.ts and src/util.ts before notes.txt.
  await expect(headers(page).first()).toHaveAttribute('aria-label', 'Hide src/app.ts')
  await expect(headers(page).last()).toHaveAttribute('aria-label', 'Hide notes.txt')

  await page.getByRole('tree', { name: 'Changed files' }).getByRole('treeitem', { name: /src$/ }).click()
  await expect(page.getByRole('button', { name: 'Show src/app.ts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show src/util.ts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hide notes.txt' })).toBeVisible()
})

test('files are hidden by pattern, tests first, and emptied folders leave the tree', async ({ page, app, repo }) => {
  repo.write('src/app.test.ts', 'it("works", () => {})\n')
  repo.write('docs/guide.md', '# guide\n')
  await page.goto(app.url)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: /app\.test\.ts/ })).toBeVisible()
  await page.getByRole('button', { name: 'Hide files' }).click()
  await page.getByRole('switch', { name: 'Hide Test files' }).click()
  await expect(tree.getByRole('treeitem', { name: /app\.test\.ts/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /src\/app\.test\.ts/ })).toHaveCount(0)

  await page.getByRole('textbox', { name: 'New pattern name' }).fill('Docs')
  await page.getByRole('textbox', { name: 'New hide pattern' }).fill('^docs/')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Hide patterns' })).toContainText('^docs/')
  await expect(tree.getByRole('treeitem', { name: /^docs/ })).toHaveCount(0)
  await expect(tree.getByRole('treeitem', { name: /guide\.md/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit Docs' }).click()
  await page.getByRole('textbox', { name: 'Pattern for Docs' }).fill('^nothing/')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: /guide\.md/ })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Docs' }).click()
  await expect(page.getByRole('list', { name: 'Hide patterns' })).not.toContainText('^nothing/')
})

test('each view keeps its own left panel shown or hidden', async ({ page, app }) => {
  await page.goto(app.url)
  const changes = page.getByRole('navigation', { name: 'Changed files' })
  await changes.getByRole('button', { name: 'Hide changed files' }).click()
  await expect(changes).toHaveCount(0)
  // Another view's panel stays as it was.
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await expect(page.getByRole('tree', { name: 'All files' })).toBeVisible()
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await expect(changes).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Show changed files' })).toBeVisible()
})

test('each view hides its own left panel, and views without one show no toggle', async ({ page, app }) => {
  await page.goto(app.url)
  const panel = page.getByRole('navigation', { name: 'Changed files' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Hide changed files' }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Show changed files' }).click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('ControlOrMeta+b')
  await expect(panel).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+b')
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Releases', exact: true }).click()
  await expect(page.getByRole('button', { name: /^(Hide|Show) / })).toHaveCount(0)
})

test('scrolled to the end, the tree marks the last file even though it never reaches the top', async ({
  page,
  app,
  repo,
}) => {
  const long = Array.from({ length: 200 }, (_, i) => `export const a${i} = ${i}`)
  repo.write('a/long.ts', `${long.join('\n')}\n`)
  repo.commit('long')
  repo.write('a/long.ts', `${long.map((line) => `${line} // changed`).join('\n')}\n`)
  repo.write('z/last.ts', 'export const last = 1\n')
  await page.goto(app.url)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: /long\.ts/ })).toHaveAttribute('aria-selected', 'true')
  // Rows measured on the way can grow the page, so keep going to the end as a reader would.
  await expect
    .poll(async () => {
      await page.locator('[data-diff-view]').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      return tree.getByRole('treeitem', { name: /last\.ts/ }).getAttribute('aria-selected')
    })
    .toBe('true')
})

test('when the patterns hide every file, the tree and the diff say so and can turn them off', async ({ page, app }) => {
  await page.goto(app.url)
  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree).toBeVisible()
  await page.getByRole('button', { name: 'Hide files' }).click()
  await page.getByRole('textbox', { name: 'New pattern name' }).fill('Everything')
  await page.getByRole('textbox', { name: 'New hide pattern' }).fill('.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByText('All 2 changed files are hidden by your Hide files patterns.')).toHaveCount(2)
  await page.getByRole('button', { name: 'Turn the patterns off' }).first().click()
  await expect(tree.getByRole('treeitem', { name: /app\.ts/ })).toBeVisible()
  await expect(page.locator('main')).toContainText('export const answer = 42')
})

test('a full page reads in a column as wide as GitHub keeps its own, centred on a wide screen', async ({
  page,
  app,
}) => {
  await page.setViewportSize({ width: 2400, height: 900 })
  await page.goto(`${app.url}&view=insights`)
  const column = page.locator('[data-page-column]').first()
  await expect(column).toBeVisible()
  // Both boxes in one read: while the page settles the column can be swapped out between two reads.
  await expect
    .poll(async () => {
      const [box, main] = await Promise.all([column.boundingBox(), page.getByRole('main').boundingBox()])
      if (!box || !main) return null
      // Centred in the space the page has, not pinned to its left edge.
      return { narrow: box.width <= 1280, centred: Math.abs(box.x - main.x - (main.width - box.width) / 2) < 2 }
    })
    .toEqual({ narrow: true, centred: true })
})

test('a file header short of room cuts its note first, then the path, and keeps every button', async ({
  page,
  app,
  repo,
}) => {
  const moved = 'docs/a/folder/name/long/enough/to/fill/the/header/on/a/small/window/README.md'
  repo.write(moved, '# demo\n')
  repo.git('rm', '-q', 'README.md')
  repo.git('add', moved)
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto(app.url)
  const header = page.getByRole('button', { name: `Hide ${moved}` }).locator('..')
  const viewed = header.getByRole('checkbox', { name: 'Viewed' })
  await expect(viewed).toBeVisible()
  const [row, box] = await Promise.all([header.boundingBox(), viewed.boundingBox()])
  expect(row && box && box.x + box.width <= row.x + row.width).toBe(true)
  // The path keeps enough room to tell which file it is, cut short inside its own box rather than hidden.
  const shown = header.getByRole('button', { name: moved, exact: true })
  expect((await shown.boundingBox())?.width).toBeGreaterThan(100)
  expect(await shown.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  await expect(header.getByText('+0')).toHaveCount(0)

  // With room to spare the note reads in full, on one line.
  await page.setViewportSize({ width: 1800, height: 700 })
  const note = header.getByTitle('Renamed without changes')
  await expect(note).toBeVisible()
  expect(await note.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect((await note.boundingBox())?.height).toBeLessThan(30)
})

const LONG_BRANCH = 'feature/a-very-long-branch-name-that-keeps-going-to-check-every-toolbar-and-menu'
// Overflowing its own box: what spills out of a row instead of being cut short inside it.
const spills = (element: Element) =>
  element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
// Anything drawn past the side of a parent that does not clip it, onto whatever sits next to it.
const leaks = (root: Element) =>
  [...root.querySelectorAll('*')].some((element) => {
    const parent = element.parentElement
    if (!parent || getComputedStyle(parent).overflowX !== 'visible') return false
    const [box, outer] = [element.getBoundingClientRect(), parent.getBoundingClientRect()]
    return box.width > 0 && (box.left < outer.left - 1 || box.right > outer.right + 1)
  })

test('the status bar stays one line with a long branch name, during a merge too', async ({ page, app, repo }) => {
  repo.commit('work in progress')
  repo.git('checkout', '-q', '-b', LONG_BRANCH)
  repo.write('src/app.ts', 'export const answer = 1\n')
  repo.commit('feature')
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto(app.url)
  const footer = page.locator('footer')
  await expect(footer).toContainText(LONG_BRANCH)
  expect(await footer.evaluate(spills)).toBe(false)
  expect(await footer.evaluate(leaks)).toBe(false)

  repo.git('checkout', '-q', 'main')
  repo.write('src/app.ts', 'export const answer = 2\n')
  repo.commit('main')
  expect(() => repo.git('merge', LONG_BRANCH)).toThrow()
  // Cut short, the whole line is on hover.
  await expect(
    footer.getByTitle(`Merging ${LONG_BRANCH} into main, 1 file to resolve. Open the conflicts`),
  ).toBeVisible()
  expect(await footer.evaluate(spills)).toBe(false)
  expect(await footer.evaluate(leaks)).toBe(false)
})

test('the commit panel keeps its close button and its details inside a narrow window', async ({ page, app, repo }) => {
  repo.commit('work in progress')
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto(app.url)
  await page.getByRole('button', { name: 'Commit graph', exact: true }).click()
  await page.getByText('work in progress').first().click()
  const panel = page.getByRole('complementary', { name: 'Commit' })
  await expect(panel.getByText('test@duck.local')).toBeVisible()
  const [box, close] = await Promise.all([
    panel.boundingBox(),
    panel.getByRole('button', { name: 'Close commit' }).boundingBox(),
  ])
  expect(box && close && close.x + close.width <= box.x + box.width).toBe(true)
  expect(await panel.locator('header').evaluate(spills)).toBe(false)
  expect(await panel.locator('dl').evaluate(spills)).toBe(false)
  for (const action of ['Compare with HEAD', 'New branch here']) {
    const button = await panel.getByRole('button', { name: new RegExp(action) }).boundingBox()
    expect(box && button && button.x + button.width <= box.x + box.width).toBe(true)
  }
})

test('the merge columns name each side inside its own column', async ({ page, app, repo }) => {
  repo.commit('work in progress')
  repo.git('checkout', '-q', '-b', LONG_BRANCH)
  repo.write('src/app.ts', 'export const answer = 1\n')
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  repo.write('src/app.ts', 'export const answer = 2\n')
  repo.commit('main')
  expect(() => repo.git('merge', LONG_BRANCH)).toThrow()
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto(app.url)
  await page.getByRole('button', { name: 'Resolve src/app.ts' }).first().click()
  const editor = page.getByRole('region', { name: 'Merge src/app.ts' })
  await expect(editor).toBeVisible()
  const heads = page.getByText('Current change', { exact: true }).locator('xpath=../..').locator('> *')
  await expect(heads).toHaveCount(3)
  expect(await heads.first().locator('..').evaluate(leaks)).toBe(false)
})

test('a file name too long for the tree ends in an ellipsis', async ({ page, app, repo }) => {
  const name = 'a-file-name-long-enough-that-the-changed-files-tree-has-to-cut-it-short.ts'
  repo.write(name, 'x\n')
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto(app.url)
  const label = page.getByRole('tree', { name: 'Changed files' }).getByText(name, { exact: true })
  await expect(label).toBeVisible()
  expect(
    await label.evaluate((element) => {
      const style = getComputedStyle(element)
      const cut = element.scrollWidth > element.clientWidth
      return cut && style.textOverflow === 'ellipsis' && !style.display.includes('flex')
    }),
  ).toBe(true)
})
