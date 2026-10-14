export type GitErrorCode = 'not-a-repo' | 'unknown-ref' | 'timeout' | 'failed'

export class GitError extends Error {
  constructor(
    readonly code: GitErrorCode,
    readonly exitCode: number | null,
    readonly stderr: string,
    message: string,
  ) {
    super(message)
    this.name = 'GitError'
  }
}

// Git reports most failures only through stderr text, so classify on stable phrases.
export function classify(stderr: string): GitErrorCode {
  if (/not a git repository/i.test(stderr)) return 'not-a-repo'
  if (/unknown revision|bad revision|ambiguous argument|invalid object name|bad object/i.test(stderr)) {
    return 'unknown-ref'
  }
  return 'failed'
}
