import { describe, expect, it } from 'bun:test'
import { apiBases, parseRemote } from '../forge-host'

describe('parseRemote', () => {
  it('reads github.com, Enterprise and GitLab remotes in every url form', () => {
    expect(parseRemote('git@github.com:o/r.git')).toEqual({ kind: 'github', host: 'github.com', slug: 'o/r' })
    expect(parseRemote('https://github.com/o/r')).toEqual({ kind: 'github', host: 'github.com', slug: 'o/r' })
    expect(parseRemote('https://token@ghe.corp.example/team/app.git')).toEqual({
      kind: 'github',
      host: 'ghe.corp.example',
      slug: 'team/app',
    })
    expect(parseRemote('git@gitlab.com:group/sub/project.git')).toEqual({
      kind: 'gitlab',
      host: 'gitlab.com',
      slug: 'group/sub/project',
    })
    expect(parseRemote('ssh://git@gitlab.example.com:2222/g/p.git')).toEqual({
      kind: 'gitlab',
      host: 'gitlab.example.com',
      slug: 'g/p',
    })
  })

  it('takes the kind from configuration when the host name does not tell', () => {
    expect(parseRemote('git@code.example.com:g/p.git', 'gitlab')?.kind).toBe('gitlab')
    expect(parseRemote('git@gitlab.mirror.example:g/p.git', 'github')?.kind).toBe('github')
  })

  it('refuses what is not a hosted repository', () => {
    expect(parseRemote('/srv/git/repo.git')).toBeNull()
    expect(parseRemote('git@github.com:onlyowner')).toBeNull()
  })
})

describe('apiBases', () => {
  it('points at the api of each host', () => {
    expect(apiBases({ kind: 'github', host: 'github.com', slug: 'o/r' })).toEqual({
      rest: 'https://api.github.com',
      graphql: 'https://api.github.com/graphql',
    })
    expect(apiBases({ kind: 'github', host: 'ghe.corp', slug: 'o/r' })).toEqual({
      rest: 'https://ghe.corp/api/v3',
      graphql: 'https://ghe.corp/api/graphql',
    })
    expect(apiBases({ kind: 'gitlab', host: 'gitlab.com', slug: 'g/p' })).toEqual({
      rest: 'https://gitlab.com/api/v4',
      graphql: 'https://gitlab.com/api/graphql',
    })
  })
})

describe('GitHub Enterprise', () => {
  it('talks to the host of origin with the token for that host', async () => {
    const { createRepo } = await import('@duck-diff/testing')
    const { createGitHub } = await import('../github')
    const repo = createRepo()
    repo.git('remote', 'add', 'origin', 'git@ghe.corp.example:team/app.git')
    const urls: string[] = []
    const hosts: string[] = []
    const github = createGitHub(repo.path, {
      findToken: async (host) => {
        hosts.push(host)
        return { token: 't', source: 'gh' }
      },
      fetch: (async (input: string | URL | Request) => {
        urls.push(String(input))
        if (String(input).endsWith('/graphql'))
          return Response.json({
            data: { search: { nodes: [], issueCount: 0, pageInfo: { hasNextPage: false, endCursor: null } } },
          })
        return Response.json({ login: 'me', avatar_url: '' })
      }) as typeof fetch,
    })
    try {
      expect(await github.status()).toEqual({ repo: 'team/app', user: { login: 'me', avatarUrl: '' }, source: 'gh' })
      await github.list({ kind: 'pr', state: 'open', filter: 'all', sort: 'updated', query: '' })
      expect(hosts).toEqual(['ghe.corp.example'])
      expect(urls).toEqual(['https://ghe.corp.example/api/v3/user', 'https://ghe.corp.example/api/graphql'])
    } finally {
      repo.cleanup()
    }
  })
})
