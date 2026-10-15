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

interface Job {
  key: string
  request: Omit<HighlightRequest, 'id'>
  done(response: HighlightResponse): void
}

// Two workers keep a big file from holding up the one on screen; more would mostly cost memory.
const POOL = 2

export function createHighlighter(makeWorker: (() => Worker) | null, poolSize = POOL) {
  const cache = new Map<string, Entry | 'pending'>()
  const listeners = new Set<() => void>()
  const waiting = new Map<number, (response: HighlightResponse) => void>()
  // What is on screen goes first; prefetched files wait behind it and are promoted if they scroll in.
  const urgent: Job[] = []
  const later = new Map<string, Job>()
  const idle: Worker[] = []
  let started = false
  let nextId = 0
  let version = 0

  function start() {
    if (started) return
    started = true
    for (let i = 0; i < poolSize; i++) {
      const worker = makeWorker?.()
      if (!worker) return
      worker.onmessage = (event: MessageEvent<HighlightResponse>) => {
        waiting.get(event.data.id)?.(event.data)
        waiting.delete(event.data.id)
        idle.push(worker)
        pump()
      }
      idle.push(worker)
    }
  }

  function pump() {
    while (idle.length) {
      const job = urgent.shift() ?? later.values().next().value
      if (!job) return
      later.delete(job.key)
      const worker = idle.pop() as Worker
      const id = nextId++
      waiting.set(id, job.done)
      worker.postMessage({ ...job.request, id })
    }
  }

  function settle(key: string, entry: Entry) {
    cache.set(key, entry)
    version++
    for (const listener of listeners) listener()
  }

  function enqueue(
    key: string,
    request: Omit<HighlightRequest, 'id'>,
    onDone: (response: HighlightResponse) => void,
    now: boolean,
  ) {
    start()
    const job: Job = { key, request, done: onDone }
    if (now) urgent.push(job)
    else later.set(key, job)
    pump()
  }

  function diffEntry(rows: readonly DiffRow[], path: string, key: string, now: boolean) {
    const runs = runsOf(rows)
    enqueue(
      key,
      { lang: getFiletypeFromFileName(path), runs: runs.map((run) => run.lines.join('\n')) },
      (response) => {
        const entry: Entry = { old: new Map(), new: new Map() }
        response.runs?.forEach((lines, i) => {
          const run = runs[i]
          if (!run) return
          for (const [offset, tokens] of lines.entries()) entry[run.side].set(run.start + offset, tokens)
        })
        settle(key, entry)
      },
      now,
    )
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
    text(key: string, path: string, text: string, now = true): LineTokens | null {
      if (!makeWorker) return null
      const hit = cache.get(key)
      if (hit === 'pending') {
        const queued = now ? later.get(key) : undefined
        if (queued) {
          later.delete(key)
          urgent.push(queued)
          pump()
        }
        return null
      }
      if (hit) return hit.new
      cache.set(key, 'pending')
      enqueue(
        key,
        { lang: getFiletypeFromFileName(path), runs: [text.replace(/\n$/, '')] },
        (response) => {
          const entry: Entry = { old: new Map(), new: new Map() }
          for (const [offset, tokens] of (response.runs?.[0] ?? []).entries()) entry.new.set(offset + 1, tokens)
          settle(key, entry)
        },
        now,
      )
      return null
    },
    // Returns tokens once ready; the first call for a key starts the work and later calls see the result.
    tokens(key: string, path: string, rows: readonly DiffRow[]): Entry | null {
      if (!makeWorker) return null
      const hit = cache.get(key)
      if (hit === 'pending') {
        // Prefetched and now on screen: it jumps the queue.
        const queued = later.get(key)
        if (queued) {
          later.delete(key)
          urgent.push(queued)
          pump()
        }
        return null
      }
      if (hit) return hit
      cache.set(key, 'pending')
      diffEntry(rows, path, key, true)
      return null
    },
    // Starts the workers and loads these files' grammars before any code is on screen, so the first view
    // of a diff is colored as soon as it shows.
    warm(paths: readonly string[]) {
      if (!makeWorker) return
      start()
      const found = [...new Set(paths.map((path) => getFiletypeFromFileName(path)))].slice(0, 6)
      const langs = found.length ? found : ['text']
      // Every worker gets each grammar, since either may draw the first screen.
      for (let i = 0; i < langs.length * poolSize; i++) {
        const lang = langs[i % langs.length] ?? 'text'
        const key = `warm:${lang}:${i % poolSize}`
        if (cache.has(key)) continue
        cache.set(key, 'pending')
        later.set(key, {
          key,
          request: { lang, runs: [''] },
          done: () => cache.set(key, { old: new Map(), new: new Map() }),
        })
      }
      pump()
    },
    // Starts a file the reader is about to reach, behind anything on screen.
    prefetch(key: string, path: string, rows: readonly DiffRow[]) {
      if (!makeWorker || cache.has(key)) return
      cache.set(key, 'pending')
      diffEntry(rows, path, key, false)
    },
  }
}

export type Highlighter = ReturnType<typeof createHighlighter>
