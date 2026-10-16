import { expect, test } from './fixture'

// The page draws with JetBrains Mono and Nerd Font icons whether or not the machine has them installed.
test('carries its own text font and Nerd Font icons', async ({ page, app }) => {
  const fetched: number[] = []
  page.on('response', (response) => {
    if (response.url().includes('SymbolsNerdFont')) fetched.push(response.status())
  })
  await page.goto(app.url)
  await expect(page.locator('main')).toBeVisible()
  const faces = await page.evaluate(async () => ({
    // A folder icon from nvim-tree and a Material Design one from the plane above the BMP.
    icons: (await document.fonts.load('15px "Symbols Nerd Font"', '\u{f0219}')).length,
    text: (await document.fonts.load('italic 700 15px "JetBrains Mono"', 'duck')).length,
  }))
  expect(faces).toEqual({ icons: 1, text: 1 })
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Symbols Nerd Font')
  // The preload in the html and the stylesheet ask for one file, once.
  expect(fetched).toEqual([200])
})
