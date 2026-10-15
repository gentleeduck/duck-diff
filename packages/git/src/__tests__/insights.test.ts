import { execFileSync } from 'node:child_process'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { readInsights, weekStart } from '../index'

let repo: TestRepo
afterEach(() => repo?.cleanup())

// A commit by someone at a fixed time, so weeks and counts are known.
function commitAs(name: string, date: string, file: string) {
  repo.write(file, `${file} ${date}\n`)
  repo.git('add', '-A')
  execFileSync('git', ['commit', '-q', '-m', `${name} ${file}`], {
    cwd: repo.path,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: `${name}@x`,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: `${name}@x`,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  })
}

describe('readInsights', () => {
  it('counts commits per person and per week since a date', async () => {
    repo = createRepo()
    commitAs('ann', '2026-09-28T10:00:00Z', 'a')
    commitAs('bob', '2026-09-29T10:00:00Z', 'b')
    commitAs('ann', '2026-10-06T10:00:00Z', 'c')
    commitAs('ann', '2026-10-07T10:00:00Z', 'd')
    const insights = await readInsights(repo.path, {
      since: Date.parse('2026-09-27T00:00:00Z') / 1000,
      until: Date.parse('2026-10-14T00:00:00Z') / 1000,
    })
    expect(insights.total).toBe(4)
    expect(insights.contributors).toEqual([
      { name: 'ann', email: 'ann@x', commits: 3 },
      { name: 'bob', email: 'bob@x', commits: 1 },
    ])
    // The week the period starts in, the two busy ones, and the quiet one up to the end.
    expect(insights.weeks).toEqual([
      { start: Date.parse('2026-09-21T00:00:00Z') / 1000, commits: 0 },
      { start: Date.parse('2026-09-28T00:00:00Z') / 1000, commits: 2 },
      { start: Date.parse('2026-10-05T00:00:00Z') / 1000, commits: 2 },
      { start: Date.parse('2026-10-12T00:00:00Z') / 1000, commits: 0 },
    ])
  })

  it('leaves out commits before the start', async () => {
    repo = createRepo()
    commitAs('ann', '2026-01-05T10:00:00Z', 'old')
    commitAs('bob', '2026-10-06T10:00:00Z', 'new')
    const insights = await readInsights(repo.path, { since: Date.parse('2026-10-01T00:00:00Z') / 1000 })
    expect(insights.contributors.map((person) => person.name)).toEqual(['bob'])
  })

  it('starts weeks on Monday in UTC', () => {
    expect(weekStart(Date.parse('2026-10-11T23:00:00Z') / 1000)).toBe(Date.parse('2026-10-05T00:00:00Z') / 1000)
    expect(weekStart(Date.parse('2026-10-12T00:00:00Z') / 1000)).toBe(Date.parse('2026-10-12T00:00:00Z') / 1000)
  })

  it('reads an empty history as nothing', async () => {
    repo = createRepo()
    expect(await readInsights(repo.path, { since: 0 })).toEqual({ total: 0, contributors: [], weeks: [] })
  })
})
