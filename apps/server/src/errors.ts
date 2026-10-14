import { GitError } from '@duck-diff/git'
import type { ErrorBody, ErrorCode } from '@duck-diff/protocol'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const GIT_STATUS: Record<GitError['code'], number> = {
  'unknown-ref': 400,
  timeout: 504,
  'not-a-repo': 500,
  failed: 500,
  stale: 409,
}

function json(status: number, code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } }
  return Response.json(body, { status })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json(error.status, error.code, error.message)
  if (error instanceof GitError) return json(GIT_STATUS[error.code], error.code, error.message)
  if (error instanceof ZodError || error instanceof SyntaxError || error instanceof URIError) {
    return json(400, 'bad-request', 'invalid request')
  }
  return json(500, 'failed', 'internal error')
}
