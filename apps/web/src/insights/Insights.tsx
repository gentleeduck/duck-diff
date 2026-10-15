import type { Insights as InsightsData } from '@duck-diff/protocol'
import { Skeleton, ToggleGroup, ToggleGroupItem } from '@duck-diff/ui'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppProvider'

const RANGES = [
  { days: 30, label: 'Month' },
  { days: 90, label: 'Quarter' },
  { days: 365, label: 'Year' },
]

const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Who works on this branch and how often, from local history: no forge, no sign-in.
export default function Insights() {
  const { api } = useApp()
  const [days, setDays] = useState(90)
  const [data, setData] = useState<InsightsData | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    api.insights(days).then(
      (next) => alive && setData(next),
      (error: Error) => alive && setFailed(error.message),
    )
    return () => {
      alive = false
    }
  }, [api, days])

  const busiest = Math.max(1, ...(data?.weeks.map((week) => week.commits) ?? []))
  const top = Math.max(1, data?.contributors[0]?.commits ?? 1)
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-muted-foreground">
            {data
              ? `${data.total} ${data.total === 1 ? 'commit' : 'commits'} by ${data.contributors.length} ${data.contributors.length === 1 ? 'person' : 'people'} on this branch`
              : ' '}
          </p>
          <ToggleGroup
            type="single"
            value={String(days)}
            onValueChange={(next: string) => next && setDays(Number(next))}
            aria-label="Period">
            {RANGES.map((range) => (
              <ToggleGroupItem key={range.days} value={String(range.days)} size="sm">
                {range.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {failed ? <p className="text-removed">{failed}</p> : null}
        {!data && !failed ? <Skeleton className="h-48" /> : null}
        {data && !data.total ? (
          <p className="rounded-md border border-border border-dashed p-8 text-center text-muted-foreground">
            No commits in this period.
          </p>
        ) : null}
        {data?.total ? (
          <>
            <section aria-label="Commits per week" className="flex flex-col gap-2">
              <h2 className="text-tn-blue">Commits per week</h2>
              <div className="flex h-40 items-end gap-1 rounded-md border border-border p-3">
                {data.weeks.map((week) => (
                  <div
                    key={week.start}
                    title={`Week of ${day(week.start)}: ${week.commits} commits`}
                    className="min-w-0.5 flex-1 rounded-t-sm bg-tn-blue/70 hover:bg-tn-blue"
                    style={{ height: `${(week.commits / busiest) * 100}%` }}
                  />
                ))}
              </div>
              <p className="flex justify-between text-muted-foreground">
                <span>{day(data.weeks[0]?.start ?? 0)}</span>
                <span>{day(data.weeks.at(-1)?.start ?? 0)}</span>
              </p>
            </section>
            <section aria-label="Contributors" className="flex flex-col gap-2">
              <h2 className="text-tn-blue">Contributors</h2>
              <ol className="flex flex-col gap-1">
                {data.contributors.map((person) => (
                  <li key={`${person.email}:${person.name}`} className="flex items-center gap-3">
                    <span className="w-56 shrink-0 truncate" title={person.email}>
                      {person.name}
                    </span>
                    <span
                      className="h-3 rounded-sm bg-tn-green/70"
                      style={{ width: `${(person.commits / top) * 60}%` }}
                    />
                    <span className="text-muted-foreground tabular-nums">{person.commits}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
