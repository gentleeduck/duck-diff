import { diffChars, diffWordsWithSpace } from 'diff'

export type Range = [start: number, end: number]
export interface ChangedRanges {
  old: Range[]
  new: Range[]
}

const NONE: ChangedRanges = { old: [], new: [] }
const MAX_LENGTH = 1000

// Marking a line that was rewritten outright only adds noise, so mostly-different pairs get no marks.
const MIN_SHARED = 0.4

export function changedRanges(before: string, after: string, mode: 'word' | 'char'): ChangedRanges {
  if (before.length > MAX_LENGTH || after.length > MAX_LENGTH) return NONE
  const parts = mode === 'char' ? diffChars(before, after) : diffWordsWithSpace(before, after)
  const ranges: ChangedRanges = { old: [], new: [] }
  let oldAt = 0
  let newAt = 0
  let shared = 0
  for (const part of parts) {
    const length = part.value.length
    if (part.added) {
      ranges.new.push([newAt, newAt + length])
      newAt += length
    } else if (part.removed) {
      ranges.old.push([oldAt, oldAt + length])
      oldAt += length
    } else {
      if (part.value.trim()) shared += length
      oldAt += length
      newAt += length
    }
  }
  if (shared / Math.max(before.length, after.length, 1) < MIN_SHARED) return NONE
  return ranges
}
