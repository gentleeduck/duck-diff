import { type CSSProperties, createContext, memo, useContext, useMemo, useSyncExternalStore } from 'react'
import { BlameCell } from '../blame/BlameCell'
import { Code } from '../diff/Code'
import type { Token } from '../diff/highlight'
import { highlighter } from '../diff/highlighter'
import { BAR, BG, MARK, SIGN } from '../diff/RowViews'
import { changedRanges } from '../diff/words'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import type { SideLine, Who } from './merge-model'

const selectSettings = (state: Settings) => state

export const contextLines = (lines: string[], start: number): SideLine[] =>
  lines.map((text, index) => ({ kind: 'context', text, no: start + index, at: index }))

// Each column of each file scrolls sideways as one, as a file does in the diff (diff/useCodeScrollX.tsx): its
// lines carry the column's key and start at its offset.
export const ScrollRows = createContext<(key: string) => CSSProperties>(() => ({}))

const Line = memo(function Line({
  line,
  tokens,
  settings,
  blame,
  index,
}: {
  line: SideLine
  tokens: Token[] | undefined
  settings: Settings
  blame: readonly Who[] | undefined
  index: number
}) {
  const marks = useMemo(() => {
    if (!line.partner || line.kind === 'context' || settings.lineDiffType === 'none') return undefined
    const mode = settings.lineDiffType === 'char' ? 'char' : 'word'
    const [before, after] = line.kind === 'deletion' ? [line.text, line.partner] : [line.partner, line.text]
    const ranges = changedRanges(before, after, mode)
    return line.kind === 'deletion' ? ranges.old : ranges.new
  }, [line, settings.lineDiffType])
  const wrap = settings.overflow === 'wrap'
  return (
    <div className={`flex min-h-6 leading-6 ${settings.backgrounds ? BG[line.kind] : ''} ${MARK[line.kind]}`}>
      {blame ? (
        // Three columns side by side leave less room for a name than a diff does.
        <BlameCell blame={blame} index={index} className={settings.diffStyle === 'split' ? 'w-40' : 'w-56'} />
      ) : null}
      {settings.lineNumbers ? (
        <span aria-hidden className="w-[6ch] shrink-0 select-none pe-[1.5ch] text-end text-tn-gutter tabular-nums">
          {line.no ?? ''}
        </span>
      ) : (
        <span className="w-2 shrink-0" />
      )}
      <span
        aria-hidden
        className={`w-4 shrink-0 select-none border-s-2 text-center ${
          settings.diffIndicators === 'bars' ? BAR[line.kind] : 'border-transparent'
        } ${line.kind === 'addition' ? 'text-added' : line.kind === 'deletion' ? 'text-removed' : ''}`}>
        {settings.diffIndicators === 'classic' ? SIGN[line.kind] : ''}
      </span>
      <code
        data-code
        style={{ tabSize: settings.tabSize }}
        className={`min-w-0 flex-1 pe-3 ${wrap ? 'whitespace-pre-wrap break-all' : 'overflow-hidden whitespace-pre'}`}>
        {wrap ? (
          <Code text={line.text} tokens={tokens} marks={marks} />
        ) : (
          <span className="relative inline-block translate-x-[calc(var(--code-x,0px)*-1)]">
            <Code text={line.text} tokens={tokens} marks={marks} />
          </span>
        )}
      </code>
    </div>
  )
})

// A block's lines in the merge page, drawn as the diff draws them and under the same settings: colours, word
// marks, line numbers, the change markers, wrapping and tab width.
export function MergeLines({
  path,
  lines,
  column,
  dim = false,
  blame,
}: {
  path: string
  lines: SideLine[]
  // The sideways scroll this block moves with.
  column: string
  dim?: boolean
  // Who last changed each line, while blame is on.
  blame?: readonly Who[] | undefined
}) {
  const settings = useSettings(selectSettings)
  const rowStyle = useContext(ScrollRows)
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const text = lines.map((line) => line.text).join('\n')
  const tokens = text ? highlighter.text(`merge:${path}:${text.length}:${text.slice(0, 64)}`, path, text) : null
  if (!lines.length) return <div className="h-6 ps-[7ch] italic leading-6 text-muted-foreground">(nothing)</div>
  return (
    // min-w-0: in the split layout a block sits in its column's grid, which would otherwise widen to its longest line.
    <div data-scroll-key={column} style={rowStyle(column)} className={`min-w-0 ${dim ? 'opacity-40' : ''}`}>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed block
        <Line key={index} line={line} tokens={tokens?.get(index + 1)} settings={settings} blame={blame} index={index} />
      ))}
    </div>
  )
}
