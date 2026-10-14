import { describe, expect, it } from 'vitest'
import { createLayout, type GraphCommit } from '../layout'

const c = (sha: string, ...parents: string[]): GraphCommit => ({ sha, parents })

function lay(commits: GraphCommit[]) {
  const layout = createLayout()
  return layout.push(commits)
}

describe('lane layout', () => {
  it('keeps a straight history in one lane', () => {
    const rows = lay([c('c', 'b'), c('b', 'a'), c('a')])
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0])
    expect(rows.map((row) => row.width)).toEqual([1, 1, 1])
    expect(rows[2]?.segments.some((segment) => segment.to[1] === 1)).toBe(false)
  })

  it('opens a lane for a merged branch and closes it where the branch started', () => {
    // m merges f into main; f and b both come from a.
    const rows = lay([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')])
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 0])
    expect(rows[0]?.segments).toContainEqual({ from: [0, 0.5], to: [1, 1], color: rows[1]?.color })
    // Both lanes come back together at a.
    expect(rows[3]?.segments.filter((segment) => segment.to[0] === 0 && segment.to[1] === 0.5)).toHaveLength(2)
  })

  it('draws lanes that pass by a commit as straight lines', () => {
    const rows = lay([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')])
    expect(rows[2]?.segments).toContainEqual({ from: [1, 0], to: [1, 1], color: rows[1]?.color })
  })

  it('places a branch tip that nothing points at in a free lane', () => {
    const rows = lay([c('x', 'a'), c('y', 'a'), c('a')])
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0])
  })

  it('continues across pages', () => {
    const layout = createLayout()
    const first = layout.push([c('m', 'b', 'f'), c('f', 'a')])
    const second = layout.push([c('b', 'a'), c('a')])
    expect([...first, ...second].map((row) => row.lane)).toEqual([0, 1, 0, 0])
  })
})
