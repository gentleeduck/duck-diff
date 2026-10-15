import { getFiletypeFromFileName } from '@pierre/diffs'
import type { DiffRow } from './rows'

// [text, color, font style bits: 1 italic, 2 bold, 4 underline]
export type Token = [string, string, number]
export interface HighlightRequest {
  id: number
  lang: string
  runs: string[]
}
export interface HighlightResponse {
  id: number
  runs: Token[][][] | null
  error?: string
}

type Side = 'old' | 'new'
export type LineTokens = Map<number, Token[]>
export interface Entry {
  old: LineTokens
  new: LineTokens
}

interface Run {
  side: Side
  start: number
  lines: string[]
}

// Consecutive line numbers on one side are tokenized together so strings and comments that span lines stay right.
function runsOf(rows: readonly DiffRow[]): Run[] {
  const sides: Record<Side, Map<number, string>> = { old: new Map(), new: new Map() }
  for (const row of rows) {
    const lines = row.type === 'line' ? [row.line] : row.type === 'pair' ? [row.left, row.right] : []
    for (const line of lines) {
      if (!line) continue
      if (line.oldNo !== null && line.kind !== 'addition') sides.old.set(line.oldNo, line.text)
      if (line.newNo !== null && line.kind !== 'deletion') sides.new.set(line.newNo, line.text)
    }
  }
  const runs: Run[] = []
  for (const side of ['old', 'new'] as const) {
    let current: Run | null = null
    for (const no of [...sides[side].keys()].sort((a, b) => a - b)) {
      if (current && current.start + current.lines.length === no) current.lines.push(sides[side].get(no) ?? '')
      else {
        current = { side, start: no, lines: [sides[side].get(no) ?? ''] }
        runs.push(current)
      }
    }
  }
  return runs
}

export function createHighlighter(makeWorker: (() => Worker) | null) {
  const cache = new Map<string, Entry | 'pending'>()
  const listeners = new Set<() => void>()
  const waiting = new Map<number, (response: HighlightResponse) => void>()
  let worker: Worker | null = null
  let nextId = 0
  let version = 0

  function post(request: Omit<HighlightRequest, 'id'>): Promise<HighlightResponse> {
    worker ??= makeWorker?.() ?? null
    if (!worker) return Promise.resolve({ id: -1, runs: null })
    if (!worker.onmessage) {
      worker.onmessage = (event: MessageEvent<HighlightResponse>) => {
        waiting.get(event.data.id)?.(event.data)
        waiting.delete(event.data.id)
      }
    }
    const id = nextId++
    return new Promise((resolve) => {
      waiting.set(id, resolve)
      worker?.postMessage({ ...request, id })
    })
  }

  return {
    get version() {
      return version
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    // A whole file, line numbers from 1; same caching as diffs.
    text(key: string, path: string, text: string): LineTokens | null {
      const hit = cache.get(key)
      if (hit === 'pending') return null
      if (hit) return hit.new
      cache.set(key, 'pending')
      void post({ lang: getFiletypeFromFileName(path), runs: [text.replace(/\n$/, '')] }).then((response) => {
        const entry: Entry = { old: new Map(), new: new Map() }
        for (const [offset, tokens] of (response.runs?.[0] ?? []).entries()) entry.new.set(offset + 1, tokens)
        cache.set(key, entry)
        version++
        for (const listener of listeners) listener()
      })
      return null
    },
    // Returns tokens once ready; the first call for a key starts the work and later calls see the result.
    tokens(key: string, path: string, rows: readonly DiffRow[]): Entry | null {
      const hit = cache.get(key)
      if (hit === 'pending') return null
      if (hit) return hit
      cache.set(key, 'pending')
      const runs = runsOf(rows)
      void post({ lang: getFiletypeFromFileName(path), runs: runs.map((run) => run.lines.join('\n')) }).then(
        (response) => {
          const entry: Entry = { old: new Map(), new: new Map() }
          response.runs?.forEach((lines, i) => {
            const run = runs[i]
            if (!run) return
            for (const [offset, tokens] of lines.entries()) entry[run.side].set(run.start + offset, tokens)
          })
          cache.set(key, entry)
          version++
          for (const listener of listeners) listener()
        },
      )
      return null
    },
  }
}

export type Highlighter = ReturnType<typeof createHighlighter>
