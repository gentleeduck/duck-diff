import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`
const DIFF = '[data-diff-view]'
const MARKED = '[role="treeitem"][aria-current="true"]'

// Every animation frame for a while: where the scrolling area is and what the page shows.
function sampleFrames([selector, mark, ms]: readonly [string, string, number]) {
  return new Promise<{ top: number; marked: string | null }[]>((resolve) => {
    const frames: { top: number; marked: string | null }[] = []
    const start = performance.now()
    const tick = () => {
      const area = document.querySelector<HTMLElement>(selector)
      const marked = document.querySelector(mark)?.textContent?.trim() ?? null
      frames.push({ top: area?.scrollTop ?? -1, marked })
      if (performance.now() - start < ms) requestAnimationFrame(tick)
      else resolve(frames)
    }
    requestAnimationFrame(tick)
  })
}

test('the next file glides into view, and the list marks it from the first frame', async ({ page, app, repo }) => {
  const lines = (tag: string) => `${Array.from({ length: 20 }, (_, n) => `line ${n} ${tag}`).join('\n')}\n`
  for (const name of ['a1', 'a2', 'a3']) repo.write(`${name}.txt`, lines('old'))
  repo.commit('three files')
  for (const name of ['a1', 'a2', 'a3']) repo.write(`${name}.txt`, lines('new'))

  await page.goto(app.url + UNSTAGED)
  await expect(page.locator('main')).toContainText('line 19 new')
  await page.keyboard.press('Shift+J')
  await page.waitForTimeout(500)
  const before = (await page.locator(MARKED).textContent())?.trim()

  const frames = page.evaluate(sampleFrames, [DIFF, MARKED, 600] as const)
  // A few still frames first, so the move is seen from its start.
  await page.waitForTimeout(100)
  await page.keyboard.press('Shift+J')
  const seen = await frames
  const tops = seen.map((frame) => frame.top)
  const distance = Math.abs((tops.at(-1) ?? 0) - (tops[0] ?? 0))
  expect(distance).toBeGreaterThan(100)
  // A glide the eye can follow: no frame covers a quarter of the way on its own.
  const steps = tops.slice(1).map((top, index) => Math.abs(top - (tops[index] ?? top)))
  expect(Math.max(...steps)).toBeLessThan(distance / 4)
  // The list goes straight from one file to the next and stays there, never through another one or back.
  const marks = seen.map((frame) => frame.marked).filter((mark, index, all) => mark !== all[index - 1])
  expect(marks).toHaveLength(2)
  expect(marks[0]).toBe(before)
  // It moves on no later than the page does.
  const moved = tops.findIndex((top) => top !== tops[0])
  expect(seen.findIndex((frame) => frame.marked === marks[1])).toBeLessThanOrEqual(moved)
})

test('the merge page shows its files together and never says it is done before it knows', async ({
  page,
  app,
  repo,
}) => {
  repo.commit('work in progress')
  const names = ['one', 'two', 'three', 'four']
  for (const name of names) repo.write(`${name}.txt`, `${name}\nkeep\n`)
  repo.commit('base')
  repo.git('checkout', '-q', '-b', 'feature')
  for (const name of names) repo.write(`${name}.txt`, `${name} feature\nkeep\n`)
  repo.commit('feature')
  repo.git('checkout', '-q', 'main')
  for (const name of names) repo.write(`${name}.txt`, `${name} main\nkeep\n`)
  repo.commit('main')
  expect(() => repo.git('merge', 'feature')).toThrow()

  // What the page shows each frame from the first one: how many files, and any word that it is finished.
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.assign(window, { seenFrames: seen })
    const tick = () => {
      const text = document.querySelector('main')?.textContent ?? ''
      const files = document.querySelectorAll('[data-merge-file]').length
      seen.push(/Every conflict is resolved|No conflicts to resolve/.test(text) ? 'done' : `files ${files}`)
      if (seen.length < 240) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const url = new URL(app.url)
  url.pathname = '/merge'
  await page.goto(url.toString())
  await expect(page.getByRole('region', { name: 'Merge four.txt' })).toBeVisible()
  await page.waitForTimeout(300)
  const seen = await page.evaluate(() => (window as unknown as { seenFrames: string[] }).seenFrames)
  expect(seen).not.toContain('done')
  // From nothing straight to every file: no frame with only some of them.
  expect(seen.filter((frame) => frame !== 'files 0' && frame !== 'files 4')).toEqual([])
})
