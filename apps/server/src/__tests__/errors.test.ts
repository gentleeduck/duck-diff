import { describe, expect, it } from 'bun:test'
import { GitError } from '@duck-diff/git'
import { z } from 'zod'
import { errorResponse, HttpError } from '../errors'
import { iterableToStream } from '../stream'

async function body(response: Response) {
  return { status: response.status, json: await response.json() }
}

describe('errorResponse', () => {
  it('maps git errors', async () => {
    expect(await body(errorResponse(new GitError('unknown-ref', 128, 'bad', 'x')))).toEqual({
      status: 400,
      json: { error: { code: 'unknown-ref', message: 'x' } },
    })
    expect((await body(errorResponse(new GitError('timeout', null, '', 't')))).status).toBe(504)
    expect((await body(errorResponse(new GitError('not-a-repo', 128, '', 'n')))).status).toBe(500)
  })

  it('maps validation and http errors', async () => {
    const zodError = z.string().safeParse(1).error
    expect((await body(errorResponse(zodError))).json.error.code).toBe('bad-request')
    expect(await body(errorResponse(new HttpError(404, 'not-found', 'nope')))).toEqual({
      status: 404,
      json: { error: { code: 'not-found', message: 'nope' } },
    })
  })

  it('hides unknown errors behind a generic message', async () => {
    expect(await body(errorResponse(new Error('secret path /home/x')))).toEqual({
      status: 500,
      json: { error: { code: 'failed', message: 'internal error' } },
    })
  })
})

describe('iterableToStream', () => {
  it('encodes every chunk in order', async () => {
    async function* chunks() {
      yield 'a'
      yield 'bc'
    }
    expect(await new Response(iterableToStream(chunks())).text()).toBe('abc')
  })
})
