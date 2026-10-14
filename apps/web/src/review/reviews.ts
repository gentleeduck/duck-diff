import { type DiffTarget, type ReviewComment, targetKey } from '@duck-diff/protocol'
import type { Api } from '../lib/api'
import { createStore, type Store } from '../lib/store'
import type { Draft } from './annotations'

export interface ReviewsState {
  target: DiffTarget | null
  comments: ReviewComment[]
  draft: Draft | null
}

export interface Reviews extends Store<ReviewsState> {
  load(target: DiffTarget): Promise<void>
  reload(): Promise<void>
  startDraft(draft: Draft): void
  cancelDraft(): void
  save(body: string): Promise<void>
  edit(id: string, body: string): Promise<void>
  remove(id: string): Promise<void>
}

export function createReviews(api: Api): Reviews {
  const store = createStore<ReviewsState>({ target: null, comments: [], draft: null })
  let latest = 0

  async function load(target: DiffTarget) {
    const request = ++latest
    const previous = store.get().target
    if (!previous || targetKey(previous) !== targetKey(target)) {
      store.set({ target, comments: [], draft: null })
    }
    const comments = await api.reviews(target)
    if (request === latest) store.set((prev) => ({ ...prev, comments }))
  }

  return {
    ...store,
    load,
    async reload() {
      const { target } = store.get()
      if (target) await load(target)
    },
    startDraft: (draft) => store.set((prev) => ({ ...prev, draft })),
    cancelDraft: () => store.set((prev) => ({ ...prev, draft: null })),
    async save(body) {
      const { target, draft } = store.get()
      if (!target || !draft) return
      const comment = await api.createReview({ target, ...draft, body: body.trim() })
      store.set((prev) => ({ ...prev, draft: null, comments: [...prev.comments, comment] }))
    },
    async edit(id, body) {
      const updated = await api.updateReview(id, body.trim())
      store.set((prev) => ({ ...prev, comments: prev.comments.map((entry) => (entry.id === id ? updated : entry)) }))
    },
    async remove(id) {
      await api.deleteReview(id)
      store.set((prev) => ({ ...prev, comments: prev.comments.filter((entry) => entry.id !== id) }))
    },
  }
}
