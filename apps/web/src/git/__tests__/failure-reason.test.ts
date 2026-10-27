import { describe, expect, it } from 'vitest'
import { failureReason } from '../failure-reason'

const ESC = '\u001b'

describe('failureReason', () => {
  it('says a hook failed instead of repeating its colour-coded log', () => {
    const log = [
      'git push exited 1:',
      `${ESC}[2m${ESC}[35m$${ESC}[0m biome lint .`,
      `${ESC}[31;40m ERROR ${ESC}[0m run failed: command exited (2)`,
      "error: failed to push some refs to 'github.com:owner/repo.git'",
    ].join('\n')
    expect(failureReason(log)).toBe('A git hook failed, so nothing went through.')
  })

  it('names a rejected push, refused credentials and an unreachable remote', () => {
    expect(failureReason('git push exited 1: ! [rejected] main -> main (fetch first)')).toBe(
      'The remote has commits you do not have. Pull, then try again; after an amend or rebase, force push (with lease).',
    )
    expect(failureReason('fatal: Authentication failed for https://x')).toBe('The remote refused your credentials.')
    expect(failureReason("fatal: unable to access 'https://x/': Could not resolve host: x")).toBe(
      'Could not reach the remote.',
    )
  })

  it("falls back to git's own last error, without its prefix", () => {
    expect(failureReason('git checkout exited 1:\nerror: pathspec nope did not match')).toBe(
      'Pathspec nope did not match',
    )
  })
})
