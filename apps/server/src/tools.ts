import { resolve, sep } from 'node:path'
import { readTodo, runGit, writeTodo } from '@duck-diff/git'
import type { ServerEvent, ToolFinish, ToolSpec, ToolState } from '@duck-diff/protocol'
import { DiffTargetSchema, RepoPathSchema } from '@duck-diff/protocol'
import { z } from 'zod'
import { HttpError } from './errors'

// What `duck-diff mergetool`, `difftool` and `rebase-todo` ask the server for; a rebase names git's todo file,
// which the server reads and later writes itself.
export const ToolStartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('merge'), path: RepoPathSchema }),
  z.object({ kind: z.literal('diff'), path: RepoPathSchema, target: DiffTargetSchema }),
  z.object({ kind: z.literal('rebase'), todo: z.string().max(4096) }),
])
export type ToolStart = z.infer<typeof ToolStartSchema>

interface Entry {
  spec: ToolSpec
  done: boolean
  ok: boolean
  // For a rebase: the todo it writes, and the commits it may name.
  todo?: { path: string; shas: Set<string> }
}

const KEEP = 50

export function createTools(repo: string, publish: (event: ServerEvent) => void) {
  const entries = new Map<string, Entry>()
  let counter = 0
  const entry = (id: string) => {
    const found = entries.get(id)
    if (!found) throw new HttpError(404, 'not-found', `no tool ${id}`)
    return found
  }
  // Only the todo of a rebase stopped in this repo is read or written, wherever the request says it is.
  const todoOf = async (path: string) => {
    const gitDir = (await runGit(['rev-parse', '--absolute-git-dir'], { cwd: repo })).trim()
    const expected = resolve(gitDir, 'rebase-merge', 'git-rebase-todo')
    if (resolve(path) !== expected || !expected.startsWith(gitDir + sep))
      throw new HttpError(400, 'bad-request', 'not the todo of a rebase in this repository')
    return expected
  }

  return {
    async start(input: ToolStart): Promise<ToolSpec> {
      const id = `tool-${Date.now().toString(36)}-${(counter++).toString(36)}`
      let spec: ToolSpec
      let todo: Entry['todo']
      if (input.kind === 'rebase') {
        const path = await todoOf(input.todo)
        const steps = await readTodo(repo, path)
        if (!steps) throw new HttpError(422, 'bad-request', 'the todo has lines duck-diff does not plan')
        spec = { id, kind: 'rebase', steps }
        todo = { path, shas: new Set(steps.map((step) => step.commit.sha)) }
      } else spec = { ...input, id }
      entries.set(id, { spec, done: false, ok: false, todo })
      for (const old of [...entries.keys()].slice(0, Math.max(0, entries.size - KEEP))) entries.delete(old)
      publish({ type: 'tool', tool: spec })
      return spec
    },
    get: (id: string) => entry(id).spec,
    state(id: string, pages: number): ToolState {
      const { done, ok } = entry(id)
      return { done, ok, pages }
    },
    async finish(request: ToolFinish) {
      const found = entry(request.id)
      if (found.done) return
      if (found.todo && request.ok) {
        const steps = request.steps ?? []
        // The plan may reorder, reword or drop the todo's commits, never bring in others.
        if (!steps.length || steps.some((step) => !found.todo?.shas.has(step.sha)))
          throw new HttpError(400, 'bad-request', 'the plan names commits the rebase does not have')
        await writeTodo(found.todo.path, steps)
      }
      found.done = true
      found.ok = request.ok
      publish({ type: 'tool-done', id: request.id })
    },
  }
}
export type Tools = ReturnType<typeof createTools>
