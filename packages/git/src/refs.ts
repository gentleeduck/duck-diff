import { runGit } from './run'

export type RefKind = 'branch' | 'remote' | 'tag'

export interface Ref {
  name: string
  kind: RefKind
  sha: string
  committedAt: number
  current: boolean
}

const FORMAT = '%(refname)%1f%(objectname)%1f%(committerdate:unix)%1f%(HEAD)'

const PREFIXES: [string, RefKind][] = [
  ['refs/heads/', 'branch'],
  ['refs/remotes/', 'remote'],
  ['refs/tags/', 'tag'],
]

export async function listRefs(repo: string): Promise<Ref[]> {
  const out = await runGit(
    ['for-each-ref', `--format=${FORMAT}`, '--sort=-committerdate', 'refs/heads', 'refs/remotes', 'refs/tags'],
    { cwd: repo },
  )
  const refs: Ref[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const [full = '', sha = '', at = '0', head = ''] = line.split('\x1f')
    const match = PREFIXES.find(([prefix]) => full.startsWith(prefix))
    if (!match || full.endsWith('/HEAD')) continue
    refs.push({
      name: full.slice(match[0].length),
      kind: match[1],
      sha,
      committedAt: Number(at),
      current: head === '*',
    })
  }
  return refs
}
