import type { Ref, RefKind } from '@duck-diff/protocol'
import { runGit } from './run'

export type { Ref, RefKind }

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
  return [...refs, ...(await listStashes(repo))]
}

async function listStashes(repo: string): Promise<Ref[]> {
  const out = await runGit(['stash', 'list', '--format=%H%x1f%gd%x1f%ct%x1f%gs'], { cwd: repo })
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', name = '', at = '0', subject = ''] = line.split('\x1f')
      return { name, kind: 'stash' as const, sha, committedAt: Number(at), current: false, subject }
    })
}
