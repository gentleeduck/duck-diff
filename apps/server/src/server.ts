import { resolveRepo } from '@duck-diff/git'
import type { ChangeReason } from '@duck-diff/protocol'
import pageBundle from '../static/index.html' with { type: 'file' }
import { createToken, isAuthorized, TOKEN_COOKIE } from './auth'
import { errorResponse, HttpError } from './errors'
import { handleApi } from './routes'

export interface ServerOptions {
  repo: string
  token?: string
  port?: number
  idleTimeoutMs?: number
  watch?: boolean
}

export interface RunningServer {
  port: number
  token: string
  url: string
  repo: string
  stop(): Promise<void>
  notify(reason: ChangeReason): void
}

const HOST = '127.0.0.1'
// Bun types every .html import as a bundle, but `type: 'file'` yields the embedded file path.
const page = pageBundle as unknown as string

export async function createServer(options: ServerOptions): Promise<RunningServer> {
  const repo = await resolveRepo(options.repo)
  const token = options.token ?? createToken()

  const server = Bun.serve({
    hostname: HOST,
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url)
      try {
        if (!isAuthorized(request, token)) throw new HttpError(401, 'unauthorized', 'missing or wrong token')
        if (url.pathname.startsWith('/api/')) return await handleApi(repo, url)
        return new Response(Bun.file(page), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'set-cookie': `${TOKEN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
          },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  })

  const port = server.port ?? 0
  return {
    port,
    token,
    repo,
    url: `http://${HOST}:${port}/?token=${token}`,
    async stop() {
      await server.stop(true)
    },
    notify() {},
  }
}
