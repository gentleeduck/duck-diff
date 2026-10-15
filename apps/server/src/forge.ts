import type { ConversationComment, Thread } from '@duck-diff/protocol'
import { HttpError } from './errors'
import { createGitHub, type GitHub, type GitHubOptions, readRemote } from './github'
import { createGitLab, type GitLabOptions } from './gitlab'

// What the routes and the watcher use, whichever host the repo lives on. GitLab numbers merge requests
// and issues apart, so thread and comment calls say which one they mean.
export type Forge = Omit<GitHub, 'thread' | 'commentOn' | 'pullRefspec' | 'setToken'> & {
  thread(number: number, kind?: 'pr' | 'issue'): Promise<Thread>
  commentOn(number: number, body: string, kind?: 'pr' | 'issue'): Promise<ConversationComment>
  pullRefspec(number: number): Promise<string>
  setToken(token: string): Promise<void>
}

export interface ForgeOptions {
  github?: GitHubOptions
  gitlab?: GitLabOptions
}

export function createForge(repo: string, options: ForgeOptions = {}): Forge {
  const github = createGitHub(repo, options.github)
  let chosen: Promise<Record<string, unknown>> | null = null
  const pick = () => {
    chosen ??= readRemote(repo).then((remote) =>
      remote?.kind === 'gitlab'
        ? (createGitLab(remote, options.gitlab) as unknown as Record<string, unknown>)
        : (github as unknown as Record<string, unknown>),
    )
    return chosen
  }
  return new Proxy({} as Forge, {
    get(_, key) {
      if (typeof key !== 'string' || key === 'then') return undefined
      return async (...args: unknown[]) => {
        const forge = await pick()
        const method = forge[key]
        if (typeof method !== 'function') {
          throw new HttpError(501, 'failed', `${String(forge.kind ?? 'this host')} has no ${key} here yet`)
        }
        return method.apply(forge, args)
      }
    },
  })
}
