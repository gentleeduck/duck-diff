import type { ChangedFile } from '@duck-diff/protocol'
import { GitError } from './errors'
import { getPatch } from './patch'
import { runGit } from './run'
import { splitPatch } from './write'

export interface PickedLine {
  // old: a deleted line by its old number; new: an added line by its new number.
  side: 'old' | 'new'
  line: number
  text: string
}

interface Entry {
  mark: ' ' | '-' | '+'
  text: string
  key: string | null
  // Followed by "\ No newline at end of file".
  bare: boolean
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/
const BARE = '\\ No newline at end of file'

function parseBody(body: string[], oldStart: number, newStart: number): Entry[] {
  const entries: Entry[] = []
  let oldNo = oldStart
  let newNo = newStart
  for (const line of body) {
    const mark = line[0]
    if (mark === '\\') {
      const last = entries.at(-1)
      if (last) last.bare = true
      continue
    }
    if (mark === '-') entries.push({ mark, text: line.slice(1), key: `old:${oldNo++}`, bare: false })
    else if (mark === '+') entries.push({ mark, text: line.slice(1), key: `new:${newNo++}`, bare: false })
    else {
      entries.push({ mark: ' ', text: line.slice(1), key: null, bare: false })
      oldNo++
      newNo++
    }
  }
  return entries
}

const stale = (key: string) => new GitError('stale', null, '', `line ${key} changed since it was shown`)

// A patch of only the picked lines. Forward (staging, applied with --cached) turns other deletions into
// context and drops other additions; reverse (unstaging or discarding) does the opposite, since the patch
// is then matched by its new side. Every picked line must still read as the page saw it.
export function buildLinePatch(patch: string, picked: readonly PickedLine[], reverse = false): string | null {
  const { header, hunks } = splitPatch(patch)
  const want = new Map(picked.map((pick) => [`${pick.side}:${pick.line}`, pick.text]))
  const found = new Set<string>()
  const stays = reverse ? '+' : '-'
  const goes = reverse ? '-' : '+'
  const out: string[] = []
  let offset = 0
  for (const hunk of hunks) {
    const [head = '', ...body] = hunk.replace(/\n$/, '').split('\n')
    const match = HUNK.exec(head)
    if (!match) continue
    const oldStart = Number(match[1])
    const newStart = Number(match[2])
    const entries = parseBody(body, oldStart, newStart)
    const isPicked = (entry: Entry) => entry.key !== null && want.has(entry.key)
    const lines: string[] = []
    let changed = false
    for (const [i, entry] of entries.entries()) {
      const line = entry.mark + entry.text
      if (entry.mark === ' ') {
        lines.push(line, ...(entry.bare ? [BARE] : []))
        continue
      }
      if (entry.key && isPicked(entry)) {
        if (want.get(entry.key) !== entry.text) throw stale(entry.key)
        found.add(entry.key)
        changed = true
        lines.push(line, ...(entry.bare ? [BARE] : []))
        continue
      }
      if (entry.mark !== stays) continue
      if (entry.bare && entries.slice(i + 1).some((later) => later.mark === goes && isPicked(later))) {
        // The file's last line has no newline; a picked line after it needs one, so it is rewritten.
        lines.push(line, BARE, goes + entry.text)
        changed = true
      } else lines.push(` ${entry.text}`, ...(entry.bare ? [BARE] : []))
    }
    if (!changed) continue
    const oldCount = lines.filter((line) => line[0] === ' ' || line[0] === '-').length
    const newCount = lines.filter((line) => line[0] === ' ' || line[0] === '+').length
    let fromOld = reverse ? newStart - offset : oldStart
    let fromNew = reverse ? newStart : oldStart + offset
    if (!oldCount) fromOld = Math.max(0, fromNew - 1)
    if (!newCount) fromNew = Math.max(0, fromOld - 1)
    offset += newCount - oldCount
    out.push(`@@ -${fromOld},${oldCount} +${fromNew},${newCount} @@${match[3] ?? ''}`, ...lines)
  }
  for (const key of want.keys()) if (!found.has(key)) throw stale(key)
  return out.length ? `${header}${out.join('\n')}\n` : null
}

type WriteFile = Pick<ChangedFile, 'path' | 'oldPath' | 'status' | 'newSha'>

async function applyLines(
  repo: string,
  kind: 'unstaged' | 'staged',
  file: WriteFile,
  picked: readonly PickedLine[],
  flags: string[],
) {
  if (file.status === 'untracked') {
    throw new GitError('failed', null, '', 'untracked files are staged or discarded as a whole')
  }
  const patch = buildLinePatch(await getPatch(repo, { kind }, file), picked, flags.includes('--reverse'))
  if (!patch) return
  await runGit(['apply', ...flags, '--whitespace=nowarn', '-'], { cwd: repo, input: patch })
}

export function stageLines(repo: string, file: WriteFile, picked: readonly PickedLine[]) {
  return applyLines(repo, 'unstaged', file, picked, ['--cached'])
}

export function unstageLines(repo: string, file: WriteFile, picked: readonly PickedLine[]) {
  return applyLines(repo, 'staged', file, picked, ['--cached', '--reverse'])
}

export function discardLines(repo: string, file: WriteFile, picked: readonly PickedLine[]) {
  return applyLines(repo, 'unstaged', file, picked, ['--reverse'])
}
