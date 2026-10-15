import { type ServerEvent, ServerEventSchema } from '@duck-diff/protocol'

export type EventsStatus = 'connecting' | 'open' | 'closed'

interface EventsOptions {
  url: string
  onEvent(event: ServerEvent): void
  onStatus?(status: EventsStatus): void
  // Called on every (re)connect with a way to talk back, for telling the server what the page watches.
  onOpen?(send: (data: string) => void): void
  socketFactory?: (url: string) => WebSocket
  retryMs?: { min: number; max: number }
}

export function connectEvents(options: EventsOptions): () => void {
  const retry = options.retryMs ?? { min: 500, max: 5000 }
  const factory = options.socketFactory ?? ((url: string) => new WebSocket(url))
  let delay = retry.min
  let socket: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function open() {
    options.onStatus?.('connecting')
    socket = factory(options.url)
    const current = socket
    socket.onopen = () => {
      delay = retry.min
      options.onStatus?.('open')
      options.onOpen?.((data) => current.readyState === 1 && current.send(data))
    }
    socket.onmessage = (message) => {
      let data: unknown
      try {
        data = JSON.parse(String(message.data))
      } catch {
        return
      }
      const parsed = ServerEventSchema.safeParse(data)
      if (parsed.success) options.onEvent(parsed.data)
    }
    socket.onclose = () => {
      options.onStatus?.('closed')
      if (disposed) return
      timer = setTimeout(open, delay)
      delay = Math.min(delay * 2, retry.max)
    }
  }

  open()
  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    socket?.close()
  }
}
