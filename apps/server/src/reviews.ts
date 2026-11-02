import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { duckHome, repoId } from '@duck-diff/git'
import {
  type CreateReview,
  type DiffTarget,
  type OrphanedComment,
  type ReviewComment,
  ReviewCommentSchema,
  type ReviewOverview,
} from '@duck-diff/protocol'
import { HttpError } from './errors'
import { existingBranches, readHead, renamed, type Scope, scopeKey, scopeOf } from './review-scope'

type Scoped = ReviewComment & Scope
const WORK_TREE = new Set<DiffTarget['kind']>(['unstaged', 'staged', 'local'])

// Callers serialize writes through the server's queue, so read-modify-write here never interleaves.
export function createReviewStore(repo: string, dataDir = duckHome()) {
  const file = join(dataDir, repoId(repo), 'reviews.json')

  async function read(): Promise<ReviewComment[]> {
    const text = await readFile(file, 'utf8').catch(() => '[]')
    return ReviewCommentSchema.array().parse(JSON.parse(text))
  }

  async function save(comments: ReviewComment[]): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(comments, null, 2))
    await rename(temp, file)
  }

  // Comments from before they were kept per branch go to the branch checked out now, once, before anything else
  // reads or writes the file.
  let migration: Promise<void> | null = null
  const migrate = () => {
    migration ??= (async () => {
      const comments = await read()
      if (comments.every((comment) => comment.branches)) return
      const head = await readHead(repo)
      const branches = await existingBranches(repo, head)
      const scoped = await Promise.all(
        comments.map(async (comment) =>
          comment.branches ? comment : { ...comment, ...(await scopeOf(repo, comment.target, head, branches)) },
        ),
      )
      await save(scoped)
    })().catch((error) => {
      // A git or disk failure is tried again on the next read instead of failing every one after it.
      migration = null
      throw error
    })
    return migration
  }

  async function load(): Promise<Scoped[]> {
    await migrate()
    return (await read()).map((comment) => ({ ...comment, branches: comment.branches ?? [] }))
  }

  async function where() {
    const head = await readHead(repo)
    return { head, branches: await existingBranches(repo, head) }
  }

  function find(comments: ReviewComment[], id: string): number {
    const index = comments.findIndex((comment) => comment.id === id)
    if (index === -1) throw new HttpError(404, 'not-found', 'no such comment')
    return index
  }

  function orphans(comments: Scoped[], branches: Set<string>): OrphanedComment[] {
    return comments.flatMap((comment) => {
      const missing = comment.branches.filter((name) => !branches.has(name))
      return missing.length ? [{ ...comment, missing }] : []
    })
  }

  return {
    async list(target: DiffTarget): Promise<ReviewComment[]> {
      const { head, branches } = await where()
      const key = scopeKey(await scopeOf(repo, target, head, branches))
      return (await load()).filter((comment) => scopeKey(comment) === key)
    },
    async create(input: CreateReview): Promise<ReviewComment> {
      const { head, branches } = await where()
      const now = Date.now()
      const comment = { ...input, ...(await scopeOf(repo, input.target, head, branches)), id: randomUUID() }
      const saved = { ...comment, createdAt: now, updatedAt: now }
      await save([...(await load()), saved])
      return saved
    },
    async update(id: string, body: string): Promise<ReviewComment> {
      const comments = await load()
      const index = find(comments, id)
      const updated = { ...(comments[index] as Scoped), body, updatedAt: Date.now() }
      comments[index] = updated
      await save(comments)
      return updated
    },
    async remove(id: string): Promise<void> {
      const comments = await load()
      comments.splice(find(comments, id), 1)
      await save(comments)
    },
    async overview(): Promise<ReviewOverview> {
      const { branches } = await where()
      const comments = await load()
      // A Map, since a branch can be called constructor.
      const counts = new Map<string, number>()
      for (const comment of comments)
        for (const name of comment.branches) if (branches.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1)
      return { counts: Object.fromEntries(counts), orphaned: orphans(comments, branches) }
    },
    async dropBranch(name: string): Promise<void> {
      const comments = await load()
      const kept = comments.filter((comment) => !comment.branches.includes(name))
      if (kept.length !== comments.length) await save(kept)
    },
    async renameBranch(from: string, to: string): Promise<void> {
      // Not only the comments it owns: a comparison with it, as the base or the from side, names it too.
      const comments = await load()
      const next = comments.map((comment) => renamed(comment, from, to))
      if (JSON.stringify(next) !== JSON.stringify(comments)) await save(next)
    },
    // A branch created and switched to from here takes the working tree with it, so its comments go along.
    async carryWorkTree(from: string, to: string): Promise<void> {
      const comments = await load()
      const moving = (comment: Scoped) => comment.on === from && WORK_TREE.has(comment.target.kind)
      if (comments.some(moving))
        await save(comments.map((comment) => (moving(comment) ? { ...comment, on: to, branches: [to] } : comment)))
    },
    // Orphaned comments move to the branch checked out, as if written on it.
    async adopt(ids: string[]): Promise<void> {
      const { head, branches } = await where()
      if (!head.branch) throw new HttpError(409, 'bad-request', 'check out a branch to move the comments to')
      const comments = await load()
      for (const id of ids) find(comments, id)
      const missing = new Map(orphans(comments, branches).map((comment) => [comment.id, comment.missing]))
      const to = head.branch
      await save(
        comments.map((comment) =>
          ids.includes(comment.id)
            ? (missing.get(comment.id) ?? []).reduce((moved, name) => renamed(moved, name, to), comment)
            : comment,
        ),
      )
    },
    // Only the ones asked for, so a branch deleted while the question was open keeps its comments.
    async clearOrphaned(ids: string[]): Promise<void> {
      const { branches } = await where()
      const comments = await load()
      const asked = new Set(ids)
      const gone = new Set(orphans(comments, branches).flatMap(({ id }) => (asked.has(id) ? [id] : [])))
      if (gone.size) await save(comments.filter((comment) => !gone.has(comment.id)))
    },
  }
}

export type ReviewStore = ReturnType<typeof createReviewStore>
