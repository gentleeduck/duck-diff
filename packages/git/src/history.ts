import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitError } from './errors'
import { runGit } from './run'
import { mayConflict, NO_EDITOR, readOperation } from './sync'

export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

export interface RebaseStep {
  sha: string
  action: RebaseAction
  // The new message for a reword.
  message?: string
}

export interface PlanCommit {
  sha: string
  subject: string
  author: string
  time: number
}

const SEP = '\x1f'

// The commits a rebase onto base would replay, oldest first as git's todo lists them.
export async function rebasePlan(repo: string, base: string): Promise<PlanCommit[]> {
  const out = await runGit(
    ['log', '--reverse', '--no-merges', `--format=%H${SEP}%s${SEP}%an${SEP}%at`, `${base}..HEAD`],
    { cwd: repo },
  )
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', subject = '', author = '', time = '0'] = line.split(SEP)
      return { sha, subject, author, time: Number(time) }
    })
}

const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`

// A reword is a pick followed by an amend that reads the new message from a file, so no editor opens
// and no message needs escaping for the todo.
export function todoText(steps: readonly RebaseStep[], messageFile: (index: number) => string): string {
  const lines: string[] = []
  for (const [index, step] of steps.entries()) {
    if (step.action === 'reword') {
      lines.push(`pick ${step.sha}`)
      lines.push(`exec git commit --amend --only --no-verify --allow-empty -F ${quote(messageFile(index))}`)
    } else lines.push(`${step.action} ${step.sha}`)
  }
  return `${lines.join('\n')}\n`
}

async function withTemp<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'duck-diff-rebase-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function rebaseArgs(repo: string, base: string): Promise<string[]> {
  const parent = await runGit(['rev-parse', '--verify', '--quiet', `${base}`], { cwd: repo, okExitCodes: [1] })
  if (!parent.trim()) throw new GitError('unknown-ref', null, '', `no commit ${base}`)
  return ['rebase', '-i', '--autostash', base]
}

// Runs the plan as `git rebase -i`, with git's own todo replaced by it. The plan must name every commit
// after the base exactly once, so nothing is dropped by leaving it out.
export async function interactiveRebase(
  repo: string,
  base: string,
  steps: readonly RebaseStep[],
): Promise<{ conflicts: boolean; stopped: boolean }> {
  const expected = (await rebasePlan(repo, base)).map((commit) => commit.sha).sort()
  const given = steps.map((step) => step.sha).sort()
  if (expected.length !== given.length || expected.some((sha, index) => sha !== given[index])) {
    throw new GitError('stale', null, '', 'the plan must list every commit after the base exactly once')
  }
  const first = steps.find((step) => step.action !== 'drop')
  if (first && (first.action === 'squash' || first.action === 'fixup')) {
    throw new GitError('failed', null, '', 'the first commit kept cannot be squashed into one before it')
  }
  return withTemp(async (dir) => {
    for (const [index, step] of steps.entries()) {
      if (step.action === 'reword') await writeFile(join(dir, `message-${index}`), step.message ?? '')
    }
    const todo = join(dir, 'todo')
    await writeFile(
      todo,
      todoText(steps, (index) => join(dir, `message-${index}`)),
    )
    const env = { ...NO_EDITOR, GIT_SEQUENCE_EDITOR: `cp ${quote(todo)}` }
    try {
      await runGit(await rebaseArgs(repo, base), { cwd: repo, env, timeoutMs: 120_000 })
    } catch (error) {
      if (await readOperation(repo)) return { conflicts: true, stopped: true }
      throw error
    }
    return { conflicts: false, stopped: (await readOperation(repo)) === 'rebase' }
  })
}

// The staged changes become a fixup! commit and are folded straight into the commit they fix.
export async function fixupInto(repo: string, sha: string): Promise<{ conflicts: boolean }> {
  await runGit(['commit', '--no-verify', `--fixup=${sha}`], { cwd: repo, env: NO_EDITOR })
  const parent = await runGit(['rev-parse', '--verify', '--quiet', `${sha}^`], { cwd: repo, okExitCodes: [1] })
  const args = ['-c', 'sequence.editor=true', 'rebase', '-i', '--autosquash', '--autostash']
  return mayConflict(repo, parent.trim() ? [...args, `${sha}^`] : [...args, '--root'])
}

// Several commits picked in the order given, oldest first.
export function cherryPickRange(repo: string, shas: readonly string[]): Promise<{ conflicts: boolean }> {
  if (!shas.length) throw new GitError('failed', null, '', 'no commits to pick')
  return mayConflict(repo, ['cherry-pick', ...shas])
}

export interface BisectState {
  active: boolean
  // Whether a bad commit and how many good ones are marked so far.
  bad: boolean
  good: number
  // Commits still in question, while the culprit is not yet known.
  remaining: number | null
  culprit: { sha: string; subject: string } | null
  log: string
}

async function gitDir(repo: string): Promise<string> {
  return (await runGit(['rev-parse', '--absolute-git-dir'], { cwd: repo })).trim()
}

export async function readBisect(repo: string): Promise<BisectState> {
  if (!existsSync(join(await gitDir(repo), 'BISECT_START'))) {
    return { active: false, bad: false, good: 0, remaining: null, culprit: null, log: '' }
  }
  const log = await runGit(['bisect', 'log'], { cwd: repo, okExitCodes: [1] })
  // Older git writes "first bad commit", newer quotes the term: "first 'bad' commit".
  const found = /^# first '?[\w-]+'? commit: \[([0-9a-f]+)\] (.*)$/m.exec(log)
  const refs = await runGit(['for-each-ref', '--format=%(refname)', 'refs/bisect/'], { cwd: repo })
  const names = refs.split('\n').filter(Boolean)
  const bad = names.includes('refs/bisect/bad')
  const goods = names.filter((name) => name.startsWith('refs/bisect/good-'))
  if (found) {
    const culprit = { sha: found[1] ?? '', subject: found[2] ?? '' }
    return { active: true, bad, good: goods.length, remaining: 0, culprit, log }
  }
  let remaining: number | null = null
  if (bad && goods.length) {
    const count = await runGit(['rev-list', '--count', 'refs/bisect/bad', '--not', ...goods], { cwd: repo })
    remaining = Number(count.trim())
  }
  return { active: true, bad, good: goods.length, remaining, culprit: null, log }
}

// The first mark starts the session; after that git checks out the next commit to try.
export async function bisectMark(repo: string, kind: 'good' | 'bad' | 'skip', sha?: string): Promise<void> {
  if (!(await readBisect(repo)).active) await runGit(['bisect', 'start'], { cwd: repo })
  await runGit(['bisect', kind, ...(sha ? [sha] : [])], { cwd: repo })
}

// git runs the command on each commit it picks: exit 0 is good, 125 skips, anything else is bad.
export async function bisectRun(repo: string, command: string): Promise<void> {
  await runGit(['bisect', 'run', 'sh', '-c', command], { cwd: repo, timeoutMs: 600_000 })
}

export async function bisectReset(repo: string): Promise<void> {
  await runGit(['bisect', 'reset'], { cwd: repo })
}
