// Lane layout for a commit graph, the approach git log --graph and VS Code's Git Graph take: commits arrive
// newest first in topological order, each takes the lane already waiting for it, and its parents take lanes below.

export interface GraphCommit {
  sha: string
  parents: string[]
}

// Points are [lane, height] within one row: height 0 is the row's top, 0.5 its dot, 1 its bottom.
export interface Segment {
  from: [number, number]
  to: [number, number]
  color: number
}

export interface GraphRow {
  sha: string
  lane: number
  color: number
  segments: Segment[]
  // Lanes in use on this row, for sizing the graph column.
  width: number
}

interface Lane {
  sha: string
  color: number
}

export function createLayout() {
  const lanes: (Lane | null)[] = []
  let nextColor = 0

  const freeLane = () => {
    const index = lanes.indexOf(null)
    return index === -1 ? lanes.length : index
  }

  function place(commit: GraphCommit): GraphRow {
    const segments: Segment[] = []
    const waiting = lanes.flatMap((lane, index) => (lane?.sha === commit.sha ? [index] : []))
    const lane = waiting[0] ?? freeLane()
    const color = waiting.length ? (lanes[lane]?.color ?? 0) : nextColor++

    // Lanes that pass this row untouched, and lanes that end in this commit's dot.
    for (const [index, other] of lanes.entries()) {
      if (!other) continue
      if (other.sha === commit.sha) segments.push({ from: [index, 0], to: [lane, 0.5], color: other.color })
      else segments.push({ from: [index, 0], to: [index, 1], color: other.color })
    }
    for (const index of waiting) lanes[index] = null

    const [first, ...rest] = commit.parents
    if (first) {
      lanes[lane] = { sha: first, color }
      segments.push({ from: [lane, 0.5], to: [lane, 1], color })
    }
    for (const parent of rest) {
      const existing = lanes.findIndex((other) => other?.sha === parent)
      if (existing !== -1) {
        segments.push({ from: [lane, 0.5], to: [existing, 1], color: lanes[existing]?.color ?? color })
        continue
      }
      const index = freeLane()
      const branch = { sha: parent, color: nextColor++ }
      lanes[index] = branch
      segments.push({ from: [lane, 0.5], to: [index, 1], color: branch.color })
    }
    while (lanes.length && lanes.at(-1) === null) lanes.pop()

    const width = Math.max(
      lane + 1,
      lanes.length,
      ...segments.flatMap((segment) => [segment.from[0] + 1, segment.to[0] + 1]),
    )
    return { sha: commit.sha, lane, color, segments, width }
  }

  return {
    push(commits: readonly GraphCommit[]): GraphRow[] {
      return commits.map(place)
    },
  }
}
