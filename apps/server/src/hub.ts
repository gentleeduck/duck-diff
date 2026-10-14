import type { ServerEvent } from '@duck-diff/protocol'
import type { ServerWebSocket } from 'bun'

export class Hub {
  private readonly sockets = new Set<ServerWebSocket<unknown>>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly onIdle: () => void,
  ) {
    this.touch()
  }

  get size() {
    return this.sockets.size
  }

  add(socket: ServerWebSocket<unknown>) {
    this.sockets.add(socket)
    this.clearTimer()
  }

  remove(socket: ServerWebSocket<unknown>) {
    this.sockets.delete(socket)
    if (this.sockets.size === 0) this.touch()
  }

  broadcast(event: ServerEvent) {
    const message = JSON.stringify(event)
    for (const socket of this.sockets) socket.send(message)
  }

  // The idle clock only runs while nobody is connected; a saved ping from Neovim restarts it.
  touch() {
    this.clearTimer()
    if (this.sockets.size > 0) return
    this.timer = setTimeout(this.onIdle, this.idleTimeoutMs)
  }

  dispose() {
    this.clearTimer()
    for (const socket of this.sockets) socket.close()
    this.sockets.clear()
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
