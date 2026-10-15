// The GitHub topics the queries on screen follow (query/client.ts), told to the server so its one poller
// watches them and pushes changes.
let send: ((data: string) => void) | null = null
let topics: string[] = []
let pending: ReturnType<typeof setTimeout> | null = null

function announce() {
  // Mounting a page adds several topics at once; one message covers them.
  if (pending) return
  pending = setTimeout(() => {
    pending = null
    send?.(JSON.stringify({ type: 'watch', topics }))
  }, 0)
}

export function setQueryTopics(next: string[]) {
  if (next.join(' ') === topics.join(' ')) return
  topics = next
  announce()
}

export function setTopicSender(next: ((data: string) => void) | null) {
  send = next
  if (next) announce()
}
