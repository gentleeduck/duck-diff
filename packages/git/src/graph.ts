import { runGit, streamGit } from './run'

// Unit and record separators cannot appear in subjects or names, unlike | or tabs.
export const GRAPH_FORMAT = `${['%H', '%P', '%D', '%an', '%ae', '%at', '%s'].join('%x1f')}%x1e`

export interface GraphOptions {
  // Every branch and tag, or only what HEAD can reach.
  all: boolean
  limit: number
}

// Newest first in topological order, so a child always comes before its parents; the page lays out lanes from it.
export async function* streamGraph(repo: string, options: GraphOptions): AsyncIterable<string> {
  // A repo with no commits yet has a HEAD that names nothing, so there is nothing to walk from it.
  if (!options.all) {
    const head = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })
    if (!head.trim()) return
  }
  yield* streamGit(
    [
      'log',
      '--topo-order',
      `--format=${GRAPH_FORMAT}`,
      `--max-count=${options.limit}`,
      ...(options.all ? ['--all'] : ['HEAD']),
      '--',
    ],
    { cwd: repo },
  )
}

// What the graph depends on: every ref and HEAD, or HEAD alone. The same tips mean the same rows.
export async function graphTips(repo: string, all: boolean): Promise<string> {
  const head = (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repo, okExitCodes: [1] })).trim()
  if (!all) return head
  const refs = await runGit(['for-each-ref', '--format=%(refname) %(objectname)'], { cwd: repo })
  return `${head}\n${refs}`
}
