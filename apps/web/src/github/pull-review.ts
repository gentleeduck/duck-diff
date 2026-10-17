import {
  type DiffTarget,
  type GitHubReviewComment,
  type PendingComment,
  PendingCommentSchema,
  type PullDetails,
  type ReviewState,
} from '@duck-diff/protocol'
import type { Api, ReviewEvent } from '../lib/api'
import { saved } from '../lib/saved'
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
  // Pending comments are kept per repository and pull request; this says which repository once it is known.
  restore(repo: string): void
  post(input: PendingComment): Promise<void>
  reply(inReplyTo: number, body: string): Promise<void>
  edit(id: number, body: string): Promise<void>
  remove(id: number): Promise<void>
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
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = saved,
): PullReview {
  const store = createStore<PullReviewState>({ number: null, ...EMPTY })

  // A review not sent yet is kept on disk, so closing the page or restarting duck-diff never loses it.
  let repo: string | null = null
  const keyOf = (number: number) => (repo ? `duck-diff:pending-review:${repo}#${number}` : null)
  const readPending = (number: number | null): PendingComment[] => {
    const key = number === null ? null : keyOf(number)
    if (!key) return []
    try {
      const parsed = PendingCommentSchema.array().safeParse(JSON.parse(storage?.getItem(key) ?? '[]'))
      return parsed.success ? parsed.data : []
    } catch {
      return []
    }
  }
  const setPending = (next: (pending: PendingComment[]) => PendingComment[]) => {
    store.set((prev) => ({ ...prev, pending: next(prev.pending) }))
    const { number, pending } = store.get()
    const key = number === null ? null : keyOf(number)
    if (!key) return
    try {
      if (pending.length) storage?.setItem(key, JSON.stringify(pending))
      else storage?.removeItem(key)
    } catch {}
  }

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
      store.set({ number, ...EMPTY, pending: readPending(number) })
      if (number !== null) await read(number)
    },
    restore(next) {
      repo = next
      const { number, pending } = store.get()
      if (number !== null && pending.length === 0) store.set((prev) => ({ ...prev, pending: readPending(number) }))
    },
    addPending: (comment) => setPending((pending) => [...pending, comment]),
    removePending: (index) => setPending((pending) => pending.filter((_, i) => i !== index)),
    async submit(event, body) {
      const { number, pending } = store.get()
      if (number === null) return
      await api.github.review(number, event, body, pending)
      setPending(() => [])
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
    async edit(id, body) {
      const { number } = store.get()
      if (number === null) return
      await api.github.editReviewComment(id, body)
      store.set((prev) => ({
        ...prev,
        comments: prev.comments.map((comment) => (comment.id === id ? { ...comment, body } : comment)),
        // The edit may have taken the suggestion out; one that is still there is batched again by hand.
        batch: prev.batch.filter((entry) => entry !== id),
      }))
      void reads.changed(number)
    },
    async remove(id) {
      const { number } = store.get()
      if (number === null) return
      await api.github.deleteReviewComment(id)
      store.set((prev) => ({
        ...prev,
        comments: prev.comments.filter((comment) => comment.id !== id),
        batch: prev.batch.filter((entry) => entry !== id),
      }))
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
