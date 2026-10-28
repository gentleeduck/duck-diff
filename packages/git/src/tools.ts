import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { type PlanCommit, type RebaseStep, todoText } from './history'
import { runGit } from './run'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'duck-diff',
  GIT_AUTHOR_EMAIL: 'duck-diff@localhost',
  GIT_COMMITTER_NAME: 'duck-diff',
  GIT_COMMITTER_EMAIL: 'duck-diff@localhost',
}

// One side of a git difftool run (a temporary file, or /dev/null for a side without the file) as a commit
// holding just that file at path, so the diff reads it like any two commits. Nothing points at the commit;
// git's own clean-up drops it in time, as it does an old stash.
export async function snapshotCommit(repo: string, path: string, file: string): Promise<string> {
  const index = join(tmpdir(), `duck-diff-index-${randomUUID()}`)
  const env = { ...IDENTITY, GIT_INDEX_FILE: index }
  try {
    if (file !== '/dev/null' && existsSync(file)) {
      const blob = (await runGit(['hash-object', '-w', '--', file], { cwd: repo })).trim()
      const mode = statSync(file).mode & 0o111 ? '100755' : '100644'
      await runGit(['update-index', '--add', '--cacheinfo', `${mode},${blob},${path}`], { cwd: repo, env })
    }
    const tree = (await runGit(['write-tree'], { cwd: repo, env })).trim()
    return (await runGit(['commit-tree', tree, '-m', `duck-diff difftool: ${path}`], { cwd: repo, env })).trim()
  } finally {
    await rm(index, { force: true })
  }
}

const SHORT: Record<string, RebaseStep['action']> = {
  p: 'pick',
  pick: 'pick',
  r: 'reword',
  reword: 'reword',
  e: 'edit',
  edit: 'edit',
  s: 'squash',
  squash: 'squash',
  f: 'fixup',
  fixup: 'fixup',
  d: 'drop',
  drop: 'drop',
}

// The commits of a rebase todo with the action each starts with, or null for a todo with lines duck-diff does
// not plan (exec, break, merges, update-ref, fixup -C), which are left to the user's own editor.
export function parseTodo(text: string): { sha: string; action: RebaseStep['action'] }[] | null {
  const steps: { sha: string; action: RebaseStep['action'] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    // Comments start with core.commentChar, which need not be #; every command starts with a letter.
    if (!line || !/^[a-z]/i.test(line) || line === 'noop') continue
    const [word = '', sha = ''] = line.split(/\s+/)
    const action = SHORT[word]
    if (!action || !/^[0-9a-f]{4,64}$/i.test(sha)) return null
    steps.push({ sha, action })
  }
  return steps
}

const SEP = '\x1f'

// The todo's commits in its order, with what the planner shows of each.
export async function readTodo(
  repo: string,
  todo: string,
): Promise<{ commit: PlanCommit; action: RebaseStep['action'] }[] | null> {
  const steps = parseTodo(await readFile(todo, 'utf8'))
  if (!steps) return null
  if (!steps.length) return []
  const out = await runGit(
    ['log', '--no-walk=unsorted', `--format=%H${SEP}%h${SEP}%s${SEP}%an${SEP}%at`, ...steps.map((step) => step.sha)],
    { cwd: repo },
  )
  const commits = out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', short = '', subject = '', author = '', time = '0'] = line.split(SEP)
      return { sha, short, commit: { sha, subject, author, time: Number(time) } }
    })
  return steps.map((step) => {
    const found = commits.find((entry) => entry.sha.startsWith(step.sha) || step.sha.startsWith(entry.short))
    return { commit: found?.commit ?? { sha: step.sha, subject: '', author: '', time: 0 }, action: step.action }
  })
}

// The planned todo back where git reads it; a reword's message waits beside it for the amend that applies it.
export async function writeTodo(todo: string, steps: readonly RebaseStep[]): Promise<void> {
  const messageFile = (index: number) => join(dirname(todo), `duck-diff-message-${index}`)
  await Promise.all(
    steps.flatMap((step, index) =>
      step.action === 'reword' && step.message ? [writeFile(messageFile(index), step.message)] : [],
    ),
  )
  await writeFile(todo, todoText(steps, messageFile))
}
