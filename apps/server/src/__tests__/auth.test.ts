import { describe, expect, it } from 'bun:test'
import { createToken, isAuthorized, readToken, tokenCookie } from '../auth'

describe('auth', () => {
  it('creates distinct 32-char hex tokens', () => {
    const a = createToken()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(createToken()).not.toBe(a)
  })

  it("reads the token from header, query or this port's cookie, in that order", () => {
    const cookie = `other=1; ${tokenCookie(41000)}=c`
    expect(readToken(new Request('http://x/a?token=q', { headers: { 'x-duck-diff-token': 'h', cookie } }), 41000)).toBe(
      'h',
    )
    expect(readToken(new Request('http://x/a?token=q', { headers: { cookie } }), 41000)).toBe('q')
    expect(readToken(new Request('http://x/a', { headers: { cookie } }), 41000)).toBe('c')
    expect(readToken(new Request('http://x/a'), 41000)).toBeNull()
  })

  it("ignores another server's cookie on the same host", () => {
    const token = createToken()
    const other = new Request('http://x/', { headers: { cookie: `${tokenCookie(42000)}=${token}` } })
    expect(isAuthorized(other, token, 41000)).toBe(false)
    const stale = new Request(`http://x/?token=${token}`, { headers: { cookie: `${tokenCookie(41000)}=old` } })
    expect(isAuthorized(stale, token, 41000)).toBe(true)
  })

  it('authorizes only the exact token', () => {
    const token = createToken()
    expect(isAuthorized(new Request(`http://x/?token=${token}`), token, 1)).toBe(true)
    expect(isAuthorized(new Request(`http://x/?token=${token.slice(1)}`), token, 1)).toBe(false)
    expect(isAuthorized(new Request('http://x/'), token, 1)).toBe(false)
  })
})
