import type { Commit } from '@duck-diff/protocol'
import { runGit } from './run'

export type { Commit }

// Unit and record separators cannot appear in subjects, unlike | or tabs.
const FIELD = '\x1f'
const RECORD = '\x1e'
const FORMAT = `${['%H', '%P', '%an', '%ae', '%at', '%s'].join('%x1f')}%x1e`

export async function listCommits(
  repo: string,
  range: { base?: string; head: string; limit?: number; path?: string },
): Promise<Commit[]> {
  const revision = range.base ? `${range.base}..${range.head}` : range.head
  const limit = range.limit ? [`--max-count=${range.limit}`] : []
  // --follow keeps a file's history across renames; git allows it for exactly one path.
  const path = range.path ? ['--follow', '--', range.path] : ['--']
  const out = await runGit(['log', `--format=${FORMAT}`, ...limit, revision, ...path], { cwd: repo })
  return out
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha = '', parents = '', authorName = '', authorEmail = '', at = '0', subject = ''] = record.split(FIELD)
      return {
        sha,
        parents: parents ? parents.split(' ') : [],
        authorName,
        authorEmail,
        authoredAt: Number(at),
        subject,
      }
    })
}
