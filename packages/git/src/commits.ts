import type { Commit } from '@duck-diff/protocol'
import { runGit } from './run'

export type { Commit }

// Unit and record separators cannot appear in subjects, unlike | or tabs.
const FIELD = '\x1f'
const RECORD = '\x1e'
const FORMAT = `${['%H', '%P', '%an', '%ae', '%at', '%s'].join('%x1f')}%x1e`

export async function listCommits(
  repo: string,
  range: { base?: string; head: string; limit?: number; path?: string; grep?: string },
): Promise<Commit[]> {
  const revision = range.base ? `${range.base}..${range.head}` : range.head
  const limit = range.limit ? [`--max-count=${range.limit}`] : []
  // A message search reads the text as typed, so a | or a . in it is not a pattern.
  const grep = range.grep ? ['-i', '--fixed-strings', `--grep=${range.grep}`] : []
  // --follow keeps a file's history across renames; git allows it for exactly one path.
  const path = range.path ? ['--follow', '--', range.path] : ['--']
  const out = await runGit(['log', `--format=${FORMAT}`, ...limit, ...grep, revision, ...path], { cwd: repo })
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

export interface CommitDetails {
  sha: string
  parents: string[]
  authorName: string
  authorEmail: string
  authoredAt: number
  committerName: string
  committedAt: number
  message: string
}

export async function readCommit(repo: string, sha: string): Promise<CommitDetails> {
  const out = await runGit(
    ['show', '-s', `--format=${['%H', '%P', '%an', '%ae', '%at', '%cn', '%ct', '%B'].join('%x1f')}`, sha, '--'],
    { cwd: repo },
  )
  const [hash = '', parents = '', authorName = '', authorEmail = '', at = '0', committerName = '', ct = '0', ...body] =
    out.split('\x1f')
  return {
    sha: hash,
    parents: parents ? parents.split(' ') : [],
    authorName,
    authorEmail,
    authoredAt: Number(at),
    committerName,
    committedAt: Number(ct),
    message: body.join('\x1f').trimEnd(),
  }
}

export interface CommitStat {
  files: number
  additions: number
  deletions: number
}

// The size of a commit from git's one-line summary, without listing its files; a merge is measured
// against its first parent.
export async function readCommitStat(repo: string, sha: string): Promise<CommitStat> {
  const out = await runGit(['show', '--shortstat', '--format=', '--diff-merges=first-parent', sha, '--'], { cwd: repo })
  const count = (pattern: RegExp) => Number(pattern.exec(out)?.[1] ?? 0)
  return {
    files: count(/(\d+) files? changed/),
    additions: count(/(\d+) insertions?\(\+\)/),
    deletions: count(/(\d+) deletions?\(-\)/),
  }
}
