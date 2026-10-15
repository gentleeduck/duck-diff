import { runGit } from './run'

export interface Insights {
  total: number
  contributors: { name: string; email: string; commits: number }[]
  // Every week in the period, quiet ones too, oldest first; start is the Monday in UTC, in seconds.
  weeks: { start: number; commits: number }[]
}

const DAY = 86_400

export function weekStart(seconds: number): number {
  const day = Math.floor(seconds / DAY)
  // Day 0 (1970-01-01) was a Thursday; Monday is three days later in the week's order.
  return (day - ((day + 3) % 7)) * DAY
}

function everyWeek(since: number, until: number, counts: Map<number, number>) {
  const weeks: Insights['weeks'] = []
  for (let start = weekStart(since); start <= until; start += 7 * DAY)
    weeks.push({ start, commits: counts.get(start) ?? 0 })
  return weeks
}

// Who made the branch and when, from local history alone: no forge, no rate limit.
export async function readInsights(repo: string, options: { since: number; until?: number }): Promise<Insights> {
  const head = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  if (!head) return { total: 0, contributors: [], weeks: [] }
  const out = await runGit(
    [
      'log',
      '--no-merges',
      `--since=${new Date(options.since * 1000).toISOString()}`,
      '--format=%at%x1f%aN%x1f%aE',
      'HEAD',
    ],
    { cwd: repo, timeoutMs: 120_000 },
  )
  const people = new Map<string, { name: string; email: string; commits: number }>()
  const weeks = new Map<number, number>()
  let total = 0
  for (const line of out.split('\n')) {
    if (!line) continue
    const [time = '0', name = '', email = ''] = line.split('\x1f')
    total++
    const key = email.toLowerCase() || name
    const person = people.get(key) ?? { name, email, commits: 0 }
    person.commits++
    people.set(key, person)
    const week = weekStart(Number(time))
    weeks.set(week, (weeks.get(week) ?? 0) + 1)
  }
  return {
    total,
    contributors: [...people.values()].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name)),
    weeks: everyWeek(options.since, options.until ?? Date.now() / 1000, weeks),
  }
}
