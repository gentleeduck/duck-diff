export type ForgeKind = 'github' | 'gitlab'

export interface RemoteHost {
  kind: ForgeKind
  host: string
  // owner/name on GitHub; the full group path on GitLab.
  slug: string
}

// git@host:path, ssh://git@host[:port]/path and https://[user@]host/path, with or without .git.
export function parseRemote(url: string, configured?: string | null): RemoteHost | null {
  const text = url.trim()
  const match =
    /^(?:ssh|https?|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(text) ??
    /^(?:[^@/]+@)?([^/:]+):(?!\/)(.+?)(?:\.git)?\/?$/.exec(text)
  if (!match) return null
  const [, host = '', path = ''] = match
  if (!path.includes('/') || path.split('/').some((part) => !part)) return null
  const kind: ForgeKind =
    configured === 'gitlab' || configured === 'github' ? configured : /gitlab/i.test(host) ? 'gitlab' : 'github'
  return { kind, host: host.toLowerCase(), slug: path }
}

export function apiBases(remote: RemoteHost): { rest: string; graphql: string } {
  if (remote.kind === 'gitlab')
    return { rest: `https://${remote.host}/api/v4`, graphql: `https://${remote.host}/api/graphql` }
  if (remote.host === 'github.com') return { rest: 'https://api.github.com', graphql: 'https://api.github.com/graphql' }
  return { rest: `https://${remote.host}/api/v3`, graphql: `https://${remote.host}/api/graphql` }
}
