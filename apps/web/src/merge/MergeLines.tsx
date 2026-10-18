import { memo, useMemo, useSyncExternalStore } from 'react'
import { Code } from '../diff/Code'
import type { Token } from '../diff/highlight'
import { highlighter } from '../diff/highlighter'
import { BAR, BG, MARK, SIGN } from '../diff/RowViews'
import { changedRanges } from '../diff/words'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../state/settings'
import type { SideLine } from './merge-model'

const selectSettings = (state: Settings) => state

export const contextLines = (lines: string[], start: number): SideLine[] =>
  lines.map((text, index) => ({ kind: 'context', text, no: start + index }))

const Line = memo(function Line({
  line,
  tokens,
  settings,
}: {
  line: SideLine
  tokens: Token[] | undefined
  settings: Settings
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
        className={`min-w-0 flex-1 pe-3 ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
        <Code text={line.text} tokens={tokens} marks={marks} />
      </code>
    </div>
  )
})

// A block's lines in the merge page, drawn as the diff draws them and under the same settings: colours, word
// marks, line numbers, the change markers, wrapping and tab width.
export function MergeLines({ path, lines, dim = false }: { path: string; lines: SideLine[]; dim?: boolean }) {
  const settings = useSettings(selectSettings)
  useSyncExternalStore(highlighter.subscribe, () => highlighter.version)
  const text = lines.map((line) => line.text).join('\n')
  const tokens = text ? highlighter.text(`merge:${path}:${text.length}:${text.slice(0, 64)}`, path, text) : null
  if (!lines.length) return <div className="h-6 ps-[7ch] italic leading-6 text-muted-foreground">(nothing)</div>
  const wrap = settings.overflow === 'wrap'
  return (
    <div className={`${wrap ? '' : 'overflow-x-auto'} ${dim ? 'opacity-40' : ''}`}>
      <div className={wrap ? '' : 'w-max min-w-full'}>
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed block
          <Line key={index} line={line} tokens={tokens?.get(index + 1)} settings={settings} />
        ))}
      </div>
    </div>
  )
}
