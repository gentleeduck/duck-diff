import { describe, expect, it } from 'vitest'
import { move, type PlanRow, planProblem, toRows, toSteps, unchanged } from '../rebase-plan'

const commits = ['a', 'b', 'c'].map((sha) => ({ sha, subject: `add ${sha}`, author: 'd', time: 1 }))

describe('rebase plan', () => {
  it('moves rows and tells a reordered plan from the original', () => {
    const rows = toRows(commits)
    expect(unchanged(rows, commits)).toBe(true)
    const moved = move(rows, 2, 0)
    expect(moved.map((row) => row.commit.sha)).toEqual(['c', 'a', 'b'])
    expect(unchanged(moved, commits)).toBe(false)
    expect(move(rows, 0, -1)).toBe(rows)
  })

  it('names what keeps a plan from running', () => {
    const rows = toRows(commits)
    const [first, second] = rows as [PlanRow, PlanRow]
    expect(planProblem(rows)).toBeNull()
    expect(planProblem(rows.map((row) => ({ ...row, action: 'drop' })))).toMatch(/dropped/)
    expect(
      planProblem([
        { ...first, action: 'drop' },
        { ...second, action: 'fixup' },
      ]),
    ).toMatch(/fold/)
    expect(planProblem([{ ...first, action: 'reword', message: ' ' }])).toMatch(/message/)
  })

  it('sends a message only with a reword', () => {
    const rows = toRows(commits)
    const second = rows[1] as PlanRow
    rows[1] = { ...second, action: 'reword', message: 'better' }
    expect(toSteps(rows)).toEqual([
      { sha: 'a', action: 'pick' },
      { sha: 'b', action: 'reword', message: 'better' },
      { sha: 'c', action: 'pick' },
    ])
  })
})
