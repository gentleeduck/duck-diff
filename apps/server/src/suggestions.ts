import { HttpError } from './errors'

export interface SuggestionEdit {
  // 1-based and inclusive, on the pull request's head version of the file.
  start: number
  end: number
  // The lines to put there; empty deletes them.
  lines: string[]
}

const BLOCK = /```suggestion[^\n]*\n([\s\S]*?)^```/m

// The replacement lines in a review comment, or null when it suggests nothing.
export function suggestionLines(body: string): string[] | null {
  const match = BLOCK.exec(body.replace(/\r\n/g, '\n'))
  if (!match) return null
  const text = match[1] ?? ''
  return text === '' ? [] : text.replace(/\n$/, '').split('\n')
}

// Applies edits bottom up so earlier line numbers still point where the reviewer meant.
export function applyEdits(text: string, edits: SuggestionEdit[]): string {
  const crlf = text.includes('\r\n')
  const lines = (crlf ? text.replace(/\r\n/g, '\n') : text).split('\n')
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  sorted.forEach((edit, i) => {
    const below = sorted[i - 1]
    if (below && edit.end >= below.start) throw new HttpError(409, 'stale', 'two suggestions change the same lines')
    if (edit.start < 1 || edit.end > lines.length)
      throw new HttpError(409, 'stale', 'a suggestion is past the end of its file')
    lines.splice(edit.start - 1, edit.end - edit.start + 1, ...edit.lines)
  })
  const joined = lines.join('\n')
  return crlf ? joined.replace(/\n/g, '\r\n') : joined
}
