import { randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_HEADER = 'x-duck-diff-token'

// Browsers share cookies across ports, so each server names its cookie after its port to keep two open
// duck-diff pages from overwriting each other's token.
export function tokenCookie(port: number): string {
  return `duck_diff_token_${port}`
}

export function createToken(): string {
  return randomBytes(16).toString('hex')
}

// An explicit token (header or URL) wins over the cookie, which may be left over from an earlier server.
export function readToken(request: Request, port: number): string | null {
  const header = request.headers.get(TOKEN_HEADER)
  if (header) return header
  const query = new URL(request.url).searchParams.get('token')
  if (query) return query
  const name = tokenCookie(port)
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, value] = part.trim().split('=')
    if (key === name && value) return value
  }
  return null
}

export function isAuthorized(request: Request, token: string, port: number): boolean {
  const given = readToken(request, port)
  if (!given || given.length !== token.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(token))
}
