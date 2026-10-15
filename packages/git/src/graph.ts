import { streamGit } from './run'

// Unit and record separators cannot appear in subjects or names, unlike | or tabs.
export const GRAPH_FORMAT = `${['%H', '%P', '%D', '%an', '%ae', '%at', '%s'].join('%x1f')}%x1e`

export interface GraphOptions {
  // Every branch and tag, or only what HEAD can reach.
  all: boolean
  limit: number
}

// Newest first in topological order, so a child always comes before its parents; the page lays out lanes from it.
export async function* streamGraph(repo: string, options: GraphOptions): AsyncIterable<string> {
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
