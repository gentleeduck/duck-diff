import { describe, expect, it } from 'bun:test'
import { createToken, isAuthorized, readToken, TOKEN_COOKIE } from '../auth'

describe('auth', () => {
  it('creates distinct 32-char hex tokens', () => {
    const a = createToken()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(createToken()).not.toBe(a)
  })

  it('reads the token from header, cookie or query, in that order', () => {
    expect(readToken(new Request('http://x/a', { headers: { 'x-duck-diff-token': 'h' } }))).toBe('h')
    expect(readToken(new Request('http://x/a', { headers: { cookie: `other=1; ${TOKEN_COOKIE}=c` } }))).toBe('c')
    expect(readToken(new Request('http://x/a?token=q'))).toBe('q')
    expect(readToken(new Request('http://x/a'))).toBeNull()
  })

  it('authorizes only the exact token', () => {
    const token = createToken()
    expect(isAuthorized(new Request(`http://x/?token=${token}`), token)).toBe(true)
    expect(isAuthorized(new Request(`http://x/?token=${token.slice(1)}`), token)).toBe(false)
    expect(isAuthorized(new Request('http://x/'), token)).toBe(false)
  })
})
