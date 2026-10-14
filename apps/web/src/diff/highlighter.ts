import { createHighlighter } from './highlight'

// One worker and one cache for the whole page; tests run without workers and keep plain text.
export const highlighter = createHighlighter(
  typeof Worker === 'undefined'
    ? null
    : () => new Worker(new URL('./highlight.worker.ts', import.meta.url), { type: 'module' }),
)
