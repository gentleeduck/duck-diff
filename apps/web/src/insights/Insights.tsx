import { Skeleton, ToggleGroup, ToggleGroupItem } from '@duck-diff/ui'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@duck-diff/ui/chart'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { useApp } from '../app/AppProvider'
import { pageColumn } from '../app/page-column'
import { useKept } from '../lib/kept'

const CHART = {
  commits: { label: 'Commits', color: 'var(--tn-blue)' },
  people: { label: 'Commits', color: 'var(--tn-green)' },
} satisfies ChartConfig

const RANGES = [
  { days: 30, label: 'Month' },
  { days: 90, label: 'Quarter' },
  { days: 365, label: 'Year' },
]

const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Who works on this branch and how often, from local history: no forge, no sign-in.
export default function Insights() {
  const { queries } = useApp()
  const [days, setDays] = useKept('insights-days', 90)
  const { data = null, error } = useQuery(queries.git.insights(days))
  const failed = error ? error.message : null

  // The busiest people; the rest are a long tail the chart cannot label.
  const people = data?.contributors.slice(0, 15) ?? []
  const weeks = data?.weeks.map((week) => ({ ...week, week: `Week of ${day(week.start)}` })) ?? []
  return (
    <div className="h-full overflow-y-auto">
      <div {...pageColumn('gap-6')}>
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
              <ChartContainer config={CHART} className="aspect-auto h-56 w-full rounded-md border border-border p-3">
                <BarChart accessibilityLayer data={weeks} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="start"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                    tickFormatter={(start: number) => day(start)}
                  />
                  <YAxis width={44} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => (payload[0]?.payload as { week?: string } | undefined)?.week}
                      />
                    }
                  />
                  <Bar dataKey="commits" fill="var(--color-commits)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </section>
            <section aria-label="Contributors" className="flex flex-col gap-2">
              <h2 className="text-tn-blue">Contributors</h2>
              <ChartContainer
                config={CHART}
                className="aspect-auto w-full"
                style={{ height: Math.max(80, people.length * 28 + 16) }}>
                <BarChart accessibilityLayer data={people} layout="vertical" margin={{ left: 8, right: 32 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={180} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
                  <Bar dataKey="commits" fill="var(--color-people)" radius={3} barSize={14}>
                    <LabelList dataKey="commits" position="right" className="fill-muted-foreground" />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
