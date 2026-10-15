// GitHub things the open page shows, told to the server so its one poller watches them and pushes changes.
type Listener = () => void

const listeners = new Map<string, Set<Listener>>()
let send: ((data: string) => void) | null = null
let pending: ReturnType<typeof setTimeout> | null = null

function announce() {
  // Mounting a page adds several topics at once; one message covers them.
  if (pending) return
  pending = setTimeout(() => {
    pending = null
    send?.(JSON.stringify({ type: 'watch', topics: [...listeners.keys()] }))
  }, 0)
}

export function setTopicSender(next: ((data: string) => void) | null) {
  send = next
  if (next) announce()
}

export function watchTopic(topic: string, listener: Listener): () => void {
  let set = listeners.get(topic)
  if (!set) {
    set = new Set()
    listeners.set(topic, set)
    announce()
  }
  set.add(listener)
  return () => {
    const current = listeners.get(topic)
    current?.delete(listener)
    if (current && !current.size) {
      listeners.delete(topic)
      announce()
    }
  }
}

export function topicChanged(topic: string) {
  for (const listener of listeners.get(topic) ?? []) listener()
}

export const watchedTopics = () => [...listeners.keys()]
