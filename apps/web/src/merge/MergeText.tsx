import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Code } from '../diff/Code'
import type { Token } from '../diff/highlight'
import { highlighter } from '../diff/highlighter'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import { markerTints, type Tint } from './merge-model'

const selectTabSize = (state: Settings) => state.tabSize
// Colours wait for a pause in the typing, so each keystroke does not start a new highlight of the file.
const SETTLE_MS = 150

const TINT: Record<Exclude<Tint, null>, { row: string; edge: string }> = {
  ours: { row: 'bg-tn-blue/10', edge: 'border-tn-blue' },
  theirs: { row: 'bg-tn-magenta/10', edge: 'border-tn-magenta' },
  base: { row: 'bg-muted/50', edge: 'border-foreground/30' },
  marker: { row: 'bg-warning/15 text-warning', edge: 'border-warning' },
}

function hash(text: string): string {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return (value >>> 0).toString(36)
}

// Text to edit, shown as code: coloured, numbered and each side of a conflict tinted, under a see-through text
// box that takes the typing. Lines keep their colours by their text, so an edit only greys the line typed on.
export function MergeText({
  label,
  path,
  value,
  onChange,
}: {
  label: string
  // Which language to colour it as.
  path: string
  value: string
  onChange(text: string): void
}) {
  const tabSize = useSettings(selectTabSize)
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [value])
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const fresh = highlighter.text(`merge-text:${path}:${hash(settled)}`, path, settled)
  const known = useRef(new Map<string, Token[]>())
  useMemo(() => {
    if (!fresh) return
    const byText = new Map<string, Token[]>()
    for (const [index, line] of settled.split('\n').entries()) {
      const tokens = fresh.get(index + 1)
      if (tokens) byText.set(line, tokens)
    }
    known.current = byText
  }, [fresh, settled])

  const lines = value.split('\n')
  const tints = markerTints(lines)
  return (
    <div className="flex min-w-0 overflow-hidden rounded-md border border-border bg-background [font-variant-ligatures:none]">
      <div aria-hidden className="shrink-0 select-none py-2 text-end text-tn-gutter tabular-nums">
        {lines.map((_, index) => {
          const tint = tints[index]
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a line number is its place
              key={index}
              className={`h-6 w-[6ch] border-s-2 pe-[1.5ch] leading-6 ${tint ? `${TINT[tint].row} ${TINT[tint].edge}` : 'border-transparent'}`}>
              {index + 1}
            </div>
          )
        })}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative w-max min-w-full" style={{ tabSize }}>
          <div aria-hidden className="py-2">
            {lines.map((line, index) => {
              const tint = tints[index]
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows of the text as it is now
                  key={index}
                  data-tint={tint ?? ''}
                  className={`h-6 whitespace-pre px-3 leading-6 ${tint ? TINT[tint].row : ''}`}>
                  {tint === 'marker' ? line : <Code text={line} tokens={known.current.get(line)} />}
                  {line ? null : ' '}
                </div>
              )
            })}
          </div>
          <textarea
            aria-label={label}
            value={value}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 resize-none overflow-hidden whitespace-pre bg-transparent px-3 py-2 font-[inherit] text-transparent leading-6 caret-foreground outline-none selection:bg-tn-blue/30"
          />
        </div>
      </div>
    </div>
  )
}
