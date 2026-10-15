import type { DiffTarget, GitHubReviewComment, PendingComment, PullDetails, ReviewState } from '@duck-diff/protocol'
import type { Api, ReviewEvent } from '../lib/api'
import { createStore, type Store } from '../lib/store'

const PULL_REF = /^refs\/duck-diff\/pr\/(\d+)$/

// Review files compares against this ref, so a diff target says which pull request it shows.
export function pullOf(target: DiffTarget): number | null {
  if (target.kind !== 'range') return null
  const match = PULL_REF.exec(target.to)
  return match ? Number(match[1]) : null
}

export interface ThreadState {
  id: string
  resolved: boolean
  outdated: boolean
}

export interface PullReviewState {
  number: number | null
  comments: GitHubReviewComment[]
  // Line comments gathered for a review that is not sent yet, like GitHub's "Start a review".
  pending: PendingComment[]
  // Thread state by the id of the thread's first comment.
  threads: Map<number, ThreadState>
  // Files the signed-in user marked viewed on GitHub.
  viewed: Set<string>
  // Suggestion comments gathered to commit together, like GitHub's "Add suggestion to batch".
  batch: number[]
}

export interface PullReview extends Store<PullReviewState> {
  load(number: number | null): Promise<void>
  post(input: PendingComment): Promise<void>
  reply(inReplyTo: number, body: string): Promise<void>
  addPending(comment: PendingComment): void
  removePending(index: number): void
  submit(event: ReviewEvent, body: string): Promise<void>
  resolve(root: number, resolved: boolean): Promise<void>
  setViewed(path: string, viewed: boolean): Promise<void>
  toggleBatch(id: number): void
  commitSuggestions(ids: number[], message: string): Promise<void>
}

const EMPTY: Omit<PullReviewState, 'number'> = {
  comments: [],
  pending: [],
  threads: new Map(),
  viewed: new Set(),
  batch: [],
}

// Where the store reads from: the page passes the query cache, so the pull request page and its diff share one
// read, and changed() makes both read again after a write.
export interface PullReads {
  pull(number: number): Promise<PullDetails>
  reviewState(number: number): Promise<ReviewState>
  changed(number: number): Promise<void>
}

export function createPullReview(
  api: Api,
  reads: PullReads = {
    pull: (number) => api.github.pull(number),
    reviewState: (number) => api.github.reviewState(number),
    changed: async () => {},
  },
): PullReview {
  const store = createStore<PullReviewState>({ number: null, ...EMPTY })

  const read = async (number: number) => {
    const [{ reviewComments }, state] = await Promise.all([
      reads.pull(number),
      reads.reviewState(number).catch(() => ({ threads: [], viewed: [] })),
    ])
    if (store.get().number !== number) return
    store.set((prev) => ({
      ...prev,
      comments: reviewComments,
      threads: new Map(state.threads.map((thread) => [thread.root, thread])),
      viewed: new Set(state.viewed),
    }))
  }

  return {
    ...store,
    async load(number) {
      if (number === store.get().number) return
      store.set({ number, ...EMPTY })
      if (number !== null) await read(number)
    },
    addPending: (comment) => store.set((prev) => ({ ...prev, pending: [...prev.pending, comment] })),
    removePending: (index) => store.set((prev) => ({ ...prev, pending: prev.pending.filter((_, i) => i !== index) })),
    async submit(event, body) {
      const { number, pending } = store.get()
      if (number === null) return
      await api.github.review(number, event, body, pending)
      store.set((prev) => ({ ...prev, pending: [] }))
      await reads.changed(number)
      await read(number)
    },
    async resolve(root, resolved) {
      const { number, threads } = store.get()
      const thread = threads.get(root)
      if (number === null || !thread) return
      await api.github.resolveThread(number, thread.id, resolved)
      store.set((prev) => ({ ...prev, threads: new Map(prev.threads).set(root, { ...thread, resolved }) }))
    },
    async setViewed(path, viewed) {
      const { number } = store.get()
      if (number === null) return
      await api.github.setViewed(number, path, viewed)
      store.set((prev) => {
        const next = new Set(prev.viewed)
        if (viewed) next.add(path)
        else next.delete(path)
        return { ...prev, viewed: next }
      })
    },
    toggleBatch: (id) =>
      store.set((prev) => ({
        ...prev,
        batch: prev.batch.includes(id) ? prev.batch.filter((entry) => entry !== id) : [...prev.batch, id],
      })),
    async commitSuggestions(ids, message) {
      const { number } = store.get()
      if (number === null) return
      await api.github.applySuggestions(number, ids, message)
      store.set((prev) => ({ ...prev, batch: prev.batch.filter((id) => !ids.includes(id)) }))
      await reads.changed(number)
      await read(number)
    },
    async post(input) {
      const { number } = store.get()
      if (number === null) return
      const comment = await api.github.reviewComment(number, input)
      store.set((prev) => ({ ...prev, comments: [...prev.comments, comment] }))
      void reads.changed(number)
    },
    async reply(inReplyTo, body) {
      const { number } = store.get()
      if (number === null) return
      const comment = await api.github.reply(number, inReplyTo, body)
      store.set((prev) => ({ ...prev, comments: [...prev.comments, comment] }))
      void reads.changed(number)
    },
  }
}
