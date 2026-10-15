import type { Api } from '../lib/api'

export interface HoverDetails {
  message: string
  files: number
  additions: number
  deletions: number
}

// Read once per commit per page; what has arrived is kept apart so a card can show it without waiting.
const details = new Map<string, Promise<HoverDetails>>()
export const ready = new Map<string, HoverDetails>()

export function prefetchCommit(api: Api, sha: string): Promise<HoverDetails> {
  let promise = details.get(sha)
  if (!promise) {
    promise = Promise.all([api.commit(sha), api.commitStat(sha)]).then(([commit, stat]) => {
      const value = { message: commit.message, ...stat }
      ready.set(sha, value)
      return value
    })
    promise.catch(() => details.delete(sha))
    details.set(sha, promise)
  }
  return promise
}
