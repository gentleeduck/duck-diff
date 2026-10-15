// One poller for every open page: pages say which GitHub things they show, the server asks GitHub once
// per thing (conditional requests, so an unchanged answer costs no rate limit) and pushes a change to
// the pages watching it. GitHub cannot call a local server, so this is as live as it gets.

export interface WatchSource {
  // changed: null on the first answer (nothing to compare with yet).
  probe(topic: string): Promise<{ changed: boolean | null; pollSeconds?: number }>
  // Open pull requests and issues, read together in one query.
  itemsUpdatedAt(numbers: number[]): Promise<Map<number, string>>
}

// Seconds between asks; the notifications API may ask for longer through X-Poll-Interval.
const EVERY: Partial<Record<string, number>> = { notifications: 60, pulls: 30, issues: 30, runs: 15, items: 15 }
const ITEM = /^item:(\d+)$/

export function createGitHubWatch<Page>(
  source: WatchSource,
  push: (page: Page, topic: string) => void,
  intervals: Partial<Record<string, number>> = {},
) {
  const every = { ...EVERY, ...intervals }
  const pages = new Map<Page, Set<string>>()
  const due = new Map<string, number>()
  const seen = new Map<number, string>()
  let running = false

  const watchers = (topic: string) => [...pages].filter(([, topics]) => topics.has(topic)).map(([page]) => page)
  const topics = () => [...new Set([...pages.values()].flatMap((set) => [...set]))]

  async function tick(now = Date.now()): Promise<void> {
    if (running) return
    running = true
    try {
      const all = topics()
      const rest = all.filter((topic) => !ITEM.test(topic) && topic in every)
      await Promise.all(
        rest.map(async (topic) => {
          if ((due.get(topic) ?? 0) > now) return
          const answer = await source.probe(topic).catch(() => null)
          const seconds = Math.max(every[topic] ?? 30, answer?.pollSeconds ?? 0)
          due.set(topic, now + seconds * 1000)
          if (answer?.changed) for (const page of watchers(topic)) push(page, topic)
        }),
      )
      const numbers = all.flatMap((topic) => {
        const match = ITEM.exec(topic)
        return match ? [Number(match[1])] : []
      })
      if (numbers.length && (due.get('items') ?? 0) <= now) {
        due.set('items', now + (every.items ?? 15) * 1000)
        const times = await source.itemsUpdatedAt(numbers.sort((a, b) => a - b)).catch(() => null)
        for (const [number, time] of times ?? []) {
          const before = seen.get(number)
          seen.set(number, time)
          if (before !== undefined && before !== time)
            for (const page of watchers(`item:${number}`)) push(page, `item:${number}`)
        }
      }
    } finally {
      running = false
    }
  }

  return {
    subscribe(page: Page, next: string[]) {
      pages.set(page, new Set(next.slice(0, 50)))
    },
    unsubscribe(page: Page) {
      pages.delete(page)
    },
    topics,
    tick,
  }
}
