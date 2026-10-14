import { expect, test } from './fixture'

const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

// 8x8 solid PNGs in two colors, small enough to inline.
const RED = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFTEMLQkAOxA/wavJ3bwAAAAASUVORK5CYII='
const BLUE = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgYPiPFTEMLQkAOxA/wTF1VxcAAAAASUVORK5CYII='

test('shows a merge conflict once, with its markers and nothing to stage', async ({ page, app, repo }) => {
  repo.commit('edit')
  repo.git('switch', '-q', '-c', 'other', 'HEAD~1')
  repo.write('src/app.ts', 'export const answer = 7\nexport const name = "duck"\n')
  repo.commit('other')
  repo.git('switch', '-q', 'main')
  try {
    repo.git('merge', '-q', 'other')
  } catch {
    // The conflict is the point.
  }
  await page.goto(app.url + UNSTAGED)
  await expect(page.getByText('Merge conflict')).toBeVisible()
  await expect(page.getByText('<<<<<<< HEAD')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Stage file' })).toHaveCount(0)
})

test('shows a changed image before and after', async ({ page, app, repo }) => {
  repo.write('logo.png', Buffer.from(RED, 'base64'))
  repo.commit('logo')
  repo.write('logo.png', Buffer.from(BLUE, 'base64'))
  await page.goto(app.url + UNSTAGED)
  for (const name of ['logo.png, before', 'logo.png, after']) {
    const image = page.getByRole('img', { name })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(8)
  }
})
