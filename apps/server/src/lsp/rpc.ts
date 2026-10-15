import type { ChildProcessWithoutNullStreams } from 'node:child_process'

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
export type ServerRequestHandler = (method: string, params: unknown) => unknown

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message)
  }
}

// JSON-RPC 2.0 with the Content-Length framing language servers speak over stdio.
export class RpcConnection {
  private nextId = 1
  private pending = new Map<number, Pending>()
  private buffer = Buffer.alloc(0)
  private closed = false

  constructor(
    private child: ChildProcessWithoutNullStreams,
    private onServerRequest: ServerRequestHandler = () => null,
  ) {
    child.stdout.on('data', (chunk: Buffer) => this.read(chunk))
    child.on('exit', () => this.fail(new Error('language server exited')))
    child.on('error', (error) => this.fail(error))
    // Servers log freely on stderr; reading it keeps a chatty one from blocking on a full pipe.
    child.stderr.on('data', () => {})
  }

  get alive(): boolean {
    return !this.closed
  }

  request<T>(method: string, params: unknown, timeoutMs = 10_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('language server exited'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    if (!this.closed) this.send({ jsonrpc: '2.0', method, params })
  }

  private send(message: unknown): void {
    const body = Buffer.from(JSON.stringify(message), 'utf8')
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child.stdin.write(body)
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const end = this.buffer.indexOf('\r\n\r\n')
      if (end === -1) return
      const length = Number(/content-length:\s*(\d+)/i.exec(this.buffer.subarray(0, end).toString())?.[1])
      if (!Number.isFinite(length)) {
        this.buffer = this.buffer.subarray(end + 4)
        continue
      }
      if (this.buffer.length < end + 4 + length) return
      const body = this.buffer.subarray(end + 4, end + 4 + length).toString('utf8')
      this.buffer = this.buffer.subarray(end + 4 + length)
      try {
        this.dispatch(JSON.parse(body))
      } catch {}
    }
  }

  private dispatch(message: {
    id?: number | string
    method?: string
    params?: unknown
    result?: unknown
    error?: { message: string; code: number }
  }): void {
    if (message.method !== undefined) {
      if (message.id === undefined) return
      let result: unknown = null
      try {
        result = this.onServerRequest(message.method, message.params)
      } catch (error) {
        this.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: String(error) } })
        return
      }
      this.send({ jsonrpc: '2.0', id: message.id, result: result ?? null })
      return
    }
    const waiting = typeof message.id === 'number' ? this.pending.get(message.id) : undefined
    if (!waiting) return
    this.pending.delete(message.id as number)
    clearTimeout(waiting.timer)
    if (message.error) waiting.reject(new RpcError(message.error.message, message.error.code))
    else waiting.resolve(message.result ?? null)
  }

  private fail(error: Error): void {
    if (this.closed) return
    this.closed = true
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer)
      waiting.reject(error)
    }
    this.pending.clear()
  }
}
