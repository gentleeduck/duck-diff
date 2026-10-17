import type { SymbolHit } from '@duck-diff/protocol'
import { Button, Input, ResizableHandle, ResizablePanel, Skeleton } from '@duck-diff/ui'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo } from 'react'
import { useApp } from '../app/AppProvider'
import { IconTool } from '../app/IconTool'
import { useSidePanel } from '../app/side-panel'
import { openFile } from '../files/open-file'
import { useView } from '../hooks/useView'
import { useKept } from '../lib/kept'
import { useStore } from '../lib/store'
import { fileGlyph } from '../sidebar/icons'
import { sourceLabel } from './load-symbol'
import type { SymbolTarget } from './symbol-at'

type Symbol = SymbolTarget | null

const selectSymbol = (value: Symbol) => value

const SECTIONS: { kind: SymbolHit['kind']; title: string }[] = [
  { kind: 'definition', title: 'Definitions' },
  { kind: 'import', title: 'Imports' },
  { kind: 'reference', title: 'References' },
]

// Every copy of the name on screen lights up, through the CSS Highlight API so no code re-renders.
function useHighlight(name: string | null) {
  useEffect(() => {
    const registry = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights
    const HighlightClass = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (!registry || !HighlightClass) return
    if (!name) {
      registry.delete('duck-symbol')
      return
    }
    const pattern = new RegExp(`(?<![\\w$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`, 'g')
    let frame = 0
    const paint = () => {
      frame = 0
      const ranges: Range[] = []
      for (const code of document.querySelectorAll<HTMLElement>('[data-code]')) {
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const match of (node.textContent ?? '').matchAll(pattern)) {
            const range = document.createRange()
            range.setStart(node, match.index)
            range.setEnd(node, match.index + name.length)
            ranges.push(range)
          }
        }
      }
      registry.set('duck-symbol', new HighlightClass(...ranges))
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    paint()
    // Virtual rows mount as the page scrolls; each new screen gets painted too.
    document.addEventListener('scroll', later, { capture: true, passive: true })
    const observer = new MutationObserver(later)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('scroll', later, { capture: true })
      observer.disconnect()
      registry.delete('duck-symbol')
    }
  }, [name])
}

function Snippet({ text, name, column }: { text: string; name: string; column: number }) {
  const start = Math.max(0, column - 1)
  const trimmed = text.trimStart()
  const cut = text.length - trimmed.length
  const at = start - cut
  if (at < 0 || trimmed.slice(at, at + name.length) !== name) return <span className="truncate">{trimmed}</span>
  return (
    <span className="truncate">
      {trimmed.slice(0, at)}
      <mark className="rounded-sm bg-tn-yellow/30 text-foreground">{name}</mark>
      {trimmed.slice(at + name.length)}
    </span>
  )
}

// GitHub's symbol pane: where the clicked name is defined, imported and used, each opening at its line.
const PANEL = { key: 'duck-diff:symbol-panel-width', initial: 384, min: 280 }

export function SymbolPanel() {
  const app = useApp()
  const { symbol, queries } = app
  const current = useStore(symbol, selectSymbol)
  const { show } = useView()
  const side = useSidePanel(PANEL)
  const [filter, setFilter] = useKept('symbol-filter', '')
  useHighlight(current?.name ?? null)
  const found = useQuery({ ...queries.git.symbol(current ?? { name: '', ref: null }), enabled: current !== null })
  const result = current ? (found.data ?? null) : null
  const failed = found.error ? found.error.message : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new name starts with no filter
  useEffect(() => setFilter(''), [current])

  useEffect(() => {
    if (!current) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && symbol.set(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, symbol])

  const groups = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const shown = (result?.hits ?? []).filter((hit) => !query || hit.path.toLowerCase().includes(query))
    return SECTIONS.map(({ kind, title }) => {
      const hits = shown.filter((hit) => hit.kind === kind)
      const byFile = new Map<string, SymbolHit[]>()
      for (const hit of hits) byFile.set(hit.path, [...(byFile.get(hit.path) ?? []), hit])
      return { kind, title, count: hits.length, files: [...byFile] }
    }).filter((group) => group.count > 0)
  }, [result, filter])

  if (!current) return null
  const go = (hit: SymbolHit) => {
    // A language server reads other files from the working tree; only the clicked file is at the revision.
    const atRef = result?.source === 'text' || hit.path === current.at?.path
    openFile(app, hit.path, { line: hit.line, at: atRef ? current.ref : null })
    show('files')
  }

  let body: ReactNode
  if (failed) body = <p className="p-3 text-removed">{failed}</p>
  else if (!result) body = ['a', 'b', 'c', 'd'].map((key) => <Skeleton key={key} className="mx-3 my-2 h-6" />)
  else if (!groups.length)
    body = <p className="p-3 text-muted-foreground">No other place in this repository names {current.name}.</p>
  else
    body = groups.map((group) => (
      <section key={group.kind} aria-label={group.title} className="border-border border-b py-1 last:border-b-0">
        <h3 className="px-3 py-1 text-muted-foreground">
          {group.title} <span className="tabular-nums">{group.count}</span>
        </h3>
        {group.files.map(([path, hits]) => {
          const icon = fileGlyph(path.split('/').pop() ?? path)
          return (
            <div key={path} className="pb-1">
              <p className="flex min-w-0 items-center gap-1.5 px-3 py-0.5 text-foreground" title={path}>
                <span style={{ color: icon.color }}>{icon.glyph}</span>
                <span className="min-w-0 truncate">{path}</span>
              </p>
              {hits.map((hit) => (
                <Button
                  variant="nothing"
                  size="none"
                  key={`${hit.line}:${hit.column}`}
                  type="button"
                  onClick={() => go(hit)}
                  className="flex w-full cursor-pointer items-baseline gap-2 px-3 py-0.5 text-start text-muted-foreground hover:bg-accent/50 hover:text-foreground justify-start rounded-none">
                  <span className="w-10 shrink-0 text-end text-tn-gutter tabular-nums">{hit.line}</span>
                  <Snippet text={hit.text} name={current.name} column={hit.column} />
                </Button>
              ))}
            </div>
          )
        })}
      </section>
    ))

  return (
    <>
      <ResizableHandle withHandle={false} aria-label="Resize the symbol panel" onDoubleClick={side.reset} />
      <ResizablePanel id="symbol" {...side.panel} maxSize="60%" className="flex">
        <aside
          data-region="aside"
          aria-label={`Symbol ${current.name}`}
          className="flex h-full w-full min-w-0 flex-col bg-card">
          <header className="flex h-11 shrink-0 items-center gap-2 border-border border-b ps-3 pe-1">
            <span className="text-muted-foreground">Symbol</span>
            <code className="min-w-0 flex-1 truncate text-tn-yellow">{current.name}</code>
            {result ? (
              <span
                className={`shrink-0 ${result.source === 'text' ? 'text-muted-foreground' : 'text-tn-green'}`}
                title={
                  result.source === 'text'
                    ? 'Every place the name appears as text; same-named symbols mix'
                    : 'Exact answers from a language server'
                }>
                {sourceLabel(result)}
              </span>
            ) : null}
            <IconTool label="Close the symbol panel" tip="Close (Esc)" onClick={() => symbol.set(null)}>
              <X />
            </IconTool>
          </header>
          <div className="shrink-0 border-border border-b p-2">
            <Input
              aria-label="Filter by file"
              placeholder="Filter by file"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
          {result?.truncated ? (
            <p className="shrink-0 border-border border-t px-3 py-1.5 text-muted-foreground">
              Showing the first {result.hits.length} matches.
            </p>
          ) : null}
        </aside>
      </ResizablePanel>
    </>
  )
}
