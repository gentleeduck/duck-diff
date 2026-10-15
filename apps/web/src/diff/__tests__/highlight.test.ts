import { processFile } from '@pierre/diffs'
import { describe, expect, it } from 'vitest'
import { createHighlighter, type HighlightRequest } from '../highlight'
import { buildRows } from '../rows'

const diff = processFile(
  'diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n',
  { isGitDiff: true },
)
if (!diff) throw new Error('no diff')

// Stands in for the worker: answers each run with one token per line.
function fakeWorker(seen: HighlightRequest[]) {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage(request: HighlightRequest) {
      seen.push(request)
      const runs = request.runs.map((text) => text.split('\n').map((line) => [[line, '#fff', 0]]))
      queueMicrotask(() => worker.onmessage?.({ data: { id: request.id, runs } } as MessageEvent))
    },
  }
  return worker as unknown as Worker
}

describe('createHighlighter', () => {
  it('tokenizes each side in runs of consecutive lines once per key, then serves from cache', async () => {
    const seen: HighlightRequest[] = []
    const highlighter = createHighlighter(() => fakeWorker(seen))
    const rows = buildRows(diff, 'unified')
    let changes = 0
    highlighter.subscribe(() => changes++)
    expect(highlighter.tokens('k', 'a.ts', rows)).toBeNull()
    expect(highlighter.tokens('k', 'a.ts', rows)).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen).toEqual([{ id: 0, lang: 'typescript', runs: ['a\nb', 'a\nc'] }])
    expect(changes).toBe(1)
    expect(highlighter.tokens('k', 'a.ts', rows)?.new.get(2)).toEqual([['c', '#fff', 0]])
  })

  it('runs what is on screen before prefetched files, and promotes a prefetched file that scrolls in', async () => {
    const seen: HighlightRequest[] = []
    // A worker that holds every answer until released, so the queue order is visible.
    const held: (() => void)[] = []
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      postMessage(request: HighlightRequest) {
        seen.push(request)
        held.push(() => worker.onmessage?.({ data: { id: request.id, runs: [] } } as MessageEvent))
      },
    }
    const highlighter = createHighlighter(() => worker as unknown as Worker, 1)
    const rows = buildRows(diff, 'unified')
    highlighter.tokens('visible', 'a.ts', rows)
    highlighter.prefetch('soon', 'b.py', rows)
    highlighter.prefetch('later', 'c.rs', rows)
    highlighter.tokens('later', 'c.rs', rows)
    expect(seen.map((request) => request.lang)).toEqual(['typescript'])
    held.shift()?.()
    expect(seen.map((request) => request.lang)).toEqual(['typescript', 'rust'])
    held.shift()?.()
    expect(seen.map((request) => request.lang)).toEqual(['typescript', 'rust', 'python'])
  })

  it('stays plain where workers are not available', () => {
    const highlighter = createHighlighter(null)
    expect(highlighter.tokens('k', 'a.ts', buildRows(diff, 'unified'))).toBeNull()
  })
})
