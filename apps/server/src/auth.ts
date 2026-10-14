import { randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_COOKIE = 'duck_diff_token'
const TOKEN_HEADER = 'x-duck-diff-token'

export function createToken(): string {
  return randomBytes(16).toString('hex')
}

export function readToken(request: Request): string | null {
  const header = request.headers.get(TOKEN_HEADER)
  if (header) return header
  const cookie = request.headers.get('cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === TOKEN_COOKIE && value) return value
  }
  return new URL(request.url).searchParams.get('token')
}

export function isAuthorized(request: Request, token: string): boolean {
  const given = readToken(request)
  if (!given || given.length !== token.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(token))
}
