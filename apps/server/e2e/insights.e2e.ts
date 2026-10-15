import { expect, test } from './fixture'

test('insights count the commits and people on the branch from local history', async ({ page, app, repo }) => {
  repo.commit('second')
  await page.goto(`${app.url}&view=insights`)
  // Test commits carry a fixed date at the start of the year.
  await expect(page.getByText('No commits in this period.')).toBeVisible()
  await page.getByRole('radio', { name: 'Year' }).click()
  await expect(page.getByText('2 commits by 1 person on this branch')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Contributors' })).toContainText('Duck Test')
  await expect(page.getByRole('region', { name: 'Commits per week' })).toBeVisible()
})

test('discussions list and open from GitHub answers (mocked)', async ({ page, app }) => {
  const author = { login: 'ann', avatarUrl: '' }
  const summary = {
    number: 3,
    title: 'How to configure?',
    author,
    category: 'Q&A',
    emoji: ':pray:',
    answered: true,
    comments: 0,
    updatedAt: '2026-10-02T00:00:00Z',
    url: 'u',
  }
  await page.route('**/api/github/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204 })
    if (path === '/api/github/status') return route.fulfill({ json: { repo: 'o/r', user: author, source: 'gh' } })
    if (path === '/api/github/discussions') return route.fulfill({ json: [summary] })
    if (path === '/api/github/discussions/3')
      return route.fulfill({
        json: {
          ...summary,
          id: 'D',
          body: 'The question',
          createdAt: '2026-10-01T00:00:00Z',
          answerable: true,
          thread: [],
        },
      })
    return route.fulfill({ json: [] })
  })
  await page.goto(`${app.url}&view=discussions`)
  await page.getByRole('button', { name: /How to configure/ }).click()
  await expect(page.getByRole('article', { name: 'How to configure?' })).toContainText('The question')
})
