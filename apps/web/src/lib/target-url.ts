import { type DiffTarget, DiffTargetSchema } from '@duck-diff/protocol'

export const DEFAULT_TARGET: DiffTarget = { kind: 'local' }

// URLSearchParams already percent-encodes, so the param holds plain JSON.
export function readTarget(search: string): DiffTarget {
  const raw = new URLSearchParams(search).get('target')
  if (!raw) return DEFAULT_TARGET
  try {
    return DiffTargetSchema.parse(JSON.parse(raw))
  } catch {
    return DEFAULT_TARGET
  }
}

export function writeTarget(target: DiffTarget, search: string): string {
  const params = new URLSearchParams(search)
  params.set('target', JSON.stringify(target))
  return `?${params}`
}
