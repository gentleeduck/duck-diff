import type { DiffTarget, GitHubReviewComment } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'

const PULL_REF = /^refs\/duck-diff\/pr\/(\d+)$/

// Review files compares against this ref, so a diff target says which pull request it shows.
export function pullOf(target: DiffTarget): number | null {
  if (target.kind !== 'range') return null
  const match = PULL_REF.exec(target.to)
  return match ? Number(match[1]) : null
}

export interface PullReviewState {
  number: number | null
  comments: GitHubReviewComment[]
}

export interface PullReview extends Store<PullReviewState> {
  load(number: number | null): Promise<void>
  post(input: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT' }): Promise<void>
  reply(inReplyTo: number, body: string): Promise<void>
}

export function createPullReview(api: Api): PullReview {
  const store = createStore<PullReviewState>({ number: null, comments: [] })
  return {
    ...store,
    async load(number) {
      if (number === store.get().number) return
      store.set({ number, comments: [] })
      if (number === null) return
      const { reviewComments } = await api.github.pull(number)
      if (store.get().number === number) store.set({ number, comments: reviewComments })
    },
    async post(input) {
      const { number } = store.get()
      if (number === null) return
      const comment = await api.github.reviewComment(number, input)
      store.set((prev) => ({ ...prev, comments: [...prev.comments, comment] }))
    },
    async reply(inReplyTo, body) {
      const { number } = store.get()
      if (number === null) return
      const comment = await api.github.reply(number, inReplyTo, body)
      store.set((prev) => ({ ...prev, comments: [...prev.comments, comment] }))
    },
  }
}
