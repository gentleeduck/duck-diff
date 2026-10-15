import type { PlanCommit, RebaseAction } from '@duck-diff/protocol'

export interface PlanRow {
  commit: PlanCommit
  action: RebaseAction
  // Edited message for a reword; starts as the subject.
  message: string
}

export const ACTIONS: { value: RebaseAction; label: string; hint: string }[] = [
  { value: 'pick', label: 'pick', hint: 'Keep the commit as it is' },
  { value: 'reword', label: 'reword', hint: 'Keep it with a new message' },
  { value: 'edit', label: 'edit', hint: 'Stop after it to change it' },
  { value: 'squash', label: 'squash', hint: 'Fold into the commit above, keeping both messages' },
  { value: 'fixup', label: 'fixup', hint: 'Fold into the commit above, dropping this message' },
  { value: 'drop', label: 'drop', hint: 'Leave it out' },
]

export const toRows = (commits: PlanCommit[]): PlanRow[] =>
  commits.map((commit) => ({ commit, action: 'pick', message: commit.subject }))

export function move(rows: PlanRow[], from: number, to: number): PlanRow[] {
  if (from === to || to < 0 || to >= rows.length) return rows
  const next = [...rows]
  const [row] = next.splice(from, 1)
  if (row) next.splice(to, 0, row)
  return next
}

// Why the plan cannot run yet, or null when it can.
export function planProblem(rows: PlanRow[]): string | null {
  const first = rows.find((row) => row.action !== 'drop')
  if (!first) return 'Every commit is dropped; reset the branch instead.'
  if (first.action === 'squash' || first.action === 'fixup')
    return 'The first commit kept has nothing above it to fold into.'
  if (rows.some((row) => row.action === 'reword' && !row.message.trim())) return 'A reworded commit needs a message.'
  return null
}

export const unchanged = (rows: PlanRow[], commits: PlanCommit[]) =>
  rows.every((row, index) => row.commit.sha === commits[index]?.sha && row.action === 'pick')

export const toSteps = (rows: PlanRow[]) =>
  rows.map((row) =>
    row.action === 'reword'
      ? { sha: row.commit.sha, action: row.action, message: row.message }
      : { sha: row.commit.sha, action: row.action },
  )
