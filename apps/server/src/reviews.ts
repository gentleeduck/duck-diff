import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { duckHome, repoId } from '@duck-diff/git'
import {
  type CreateReview,
  type DiffTarget,
  type ReviewComment,
  ReviewCommentSchema,
  targetKey,
} from '@duck-diff/protocol'
import { HttpError } from './errors'

// Callers serialize writes through the server's queue, so read-modify-write here never interleaves.
export function createReviewStore(repo: string, dataDir = duckHome()) {
  const file = join(dataDir, repoId(repo), 'reviews.json')

  async function load(): Promise<ReviewComment[]> {
    const text = await readFile(file, 'utf8').catch(() => '[]')
    return ReviewCommentSchema.array().parse(JSON.parse(text))
  }

  async function save(comments: ReviewComment[]): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(comments, null, 2))
    await rename(temp, file)
  }

  function find(comments: ReviewComment[], id: string): number {
    const index = comments.findIndex((comment) => comment.id === id)
    if (index === -1) throw new HttpError(404, 'not-found', 'no such comment')
    return index
  }

  return {
    async list(target: DiffTarget): Promise<ReviewComment[]> {
      const key = targetKey(target)
      return (await load()).filter((comment) => targetKey(comment.target) === key)
    },
    async create(input: CreateReview): Promise<ReviewComment> {
      const now = Date.now()
      const comment = { ...input, id: randomUUID(), createdAt: now, updatedAt: now }
      await save([...(await load()), comment])
      return comment
    },
    async update(id: string, body: string): Promise<ReviewComment> {
      const comments = await load()
      const index = find(comments, id)
      const updated = { ...(comments[index] as ReviewComment), body, updatedAt: Date.now() }
      comments[index] = updated
      await save(comments)
      return updated
    },
    async remove(id: string): Promise<void> {
      const comments = await load()
      comments.splice(find(comments, id), 1)
      await save(comments)
    },
  }
}

export type ReviewStore = ReturnType<typeof createReviewStore>
