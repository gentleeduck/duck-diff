import { basename, extname } from 'node:path'
import { readSide } from '@duck-diff/git'
import type { DiffTarget, ReviewComment } from '@duck-diff/protocol'

const short = (ref: string) => ref.replace(/^[0-9a-f]{40}(?=[\^~]|$)/, (sha) => sha.slice(0, 7))

function comparison(target: DiffTarget): string {
  switch (target.kind) {
    case 'local':
      return `${short(target.base ?? 'HEAD')} to the working tree`
    case 'staged':
      return `${short(target.base ?? 'HEAD')} to the staged changes`
    case 'unstaged':
      return 'the staged files to the working tree'
    case 'range':
      return `${short(target.from)}${target.mode === 'merge-base' ? '...' : '..'}${short(target.to)}`
    case 'commit':
      return `commit ${short(target.sha)}`
  }
}

// The lines a comment is on, numbered as the diff numbers them, or null when that side no longer has them.
async function quote(repo: string, comment: ReviewComment): Promise<{ lines: string[]; first: number } | null> {
  const text = await readSide(repo, comment.target, comment.side === 'deletions' ? 'old' : 'new', comment.path).catch(
    () => null,
  )
  if (text === null) return null
  const first = comment.startLine ?? comment.line
  const lines = text.split('\n').slice(first - 1, comment.line)
  return lines.length ? { lines, first } : null
}

// A review written for an AI to act on: what was compared, then each comment under the code it is about, with the
// file, lines and side, and the exact words when only part of a line was picked.
export async function reviewPrompt(repo: string, target: DiffTarget, comments: ReviewComment[]): Promise<string> {
  const sorted = [...comments].sort(
    (a, b) => a.path.localeCompare(b.path) || (a.startLine ?? a.line) - (b.startLine ?? b.line),
  )
  const parts = [
    `Review comments on ${basename(repo)}, comparing ${comparison(target)}. Each one names the file and lines it is about, quotes them, and says what to change.`,
  ]
  for (const comment of sorted) {
    const first = comment.startLine ?? comment.line
    const where = first === comment.line ? `line ${first}` : `lines ${first} to ${comment.line}`
    const side = comment.side === 'deletions' ? 'old' : 'new'
    const section = [`## ${comment.path}, ${where} (${side})`]
    const quoted = await quote(repo, comment)
    if (quoted) {
      const width = String(quoted.first + quoted.lines.length - 1).length
      const numbered = quoted.lines.map((line, i) => `${String(quoted.first + i).padStart(width)}  ${line}`)
      section.push(`\`\`\`${extname(comment.path).slice(1)}\n${numbered.join('\n')}\n\`\`\``)
      if (comment.startCol !== undefined && comment.endCol !== undefined) {
        const last = quoted.lines.length - 1
        const words = quoted.lines
          .map((line, i) => line.slice(i === 0 ? comment.startCol : 0, i === last ? comment.endCol : undefined))
          .join('\n')
        section.push(`On the words \`${words}\`:`)
      }
    } else section.push('(These lines are no longer in this comparison.)')
    section.push(comment.body.trim())
    parts.push(section.join('\n\n'))
  }
  return `${parts.join('\n\n')}\n`
}
