import type { LspHover, LspLocation } from '@duck-diff/protocol'
import { Button, Popover, PopoverAnchor, PopoverContent, Toggle } from '@duck-diff/ui'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { LinesSkeleton } from '../app/skeletons'
import { openFile } from '../files/open-file'
import { useView } from '../hooks/useView'
import { Markdown } from '../markdown/Markdown'
import { fileGlyph } from '../sidebar/icons'
import { goToDefinition } from './navigate'
import { type SymbolTarget, symbolAtPoint } from './symbol-at'
import { type LocateSymbol, targetOf } from './useSymbolClick'

const DELAY_MS = 450
const GRACE_MS = 200
// Wide enough for a type signature on one line most of the time; longer ones wrap.
const WIDTH = 900

interface Shown {
  target: SymbolTarget & { at: NonNullable<SymbolTarget['at']> }
  rect: DOMRect
  hover: LspHover
}

const spot = (target: Shown['target']) => `${target.ref ?? ''}|${target.at.path}:${target.at.line}:${target.at.column}`

function Peek({ target, onOpen }: { target: Shown['target']; onOpen(location: LspLocation): void }) {
  const { api } = useApp()
  const [found, setFound] = useState<LspLocation[] | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    api.lsp
      .references({ ...target.at, ...(target.ref ? { ref: target.ref } : {}) })
      .then((next) => alive && setFound(next.locations))
      .catch(() => alive && setFound(null))
    return () => {
      alive = false
    }
  }, [api, target])
  if (found === undefined) return <LinesSkeleton count={2} className="px-3 py-2" />
  if (!found?.length) return <p className="px-3 py-2 text-muted-foreground">No references found.</p>
  return (
    <ul aria-label="References" className="max-h-72 overflow-y-auto py-1">
      {found.map((location) => {
        const icon = fileGlyph(location.path.split('/').pop() ?? location.path)
        return (
          <li key={`${location.path}:${location.line}:${location.column}`}>
            <Button
              variant="nothing"
              size="none"
              type="button"
              onClick={() => onOpen(location)}
              className="flex w-full cursor-pointer items-baseline gap-2 px-3 py-0.5 text-start text-muted-foreground hover:bg-accent/50 hover:text-foreground justify-start rounded-none">
              <span className="flex w-56 shrink-0 items-baseline gap-1.5 truncate" title={location.path}>
                <span style={{ color: icon.color }}>{icon.glyph}</span>
                <span className="truncate">
                  {location.path}:{location.line}
                </span>
              </span>
              <span className="min-w-0 truncate whitespace-pre text-foreground">{location.text.trim()}</span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

// Resting the pointer on a name shows what the language server knows about it, as GitHub and editors do,
// with its definition, every reference, or a peek at the references right under the line.
export function CodeHover({ root, locate }: { root: () => HTMLElement | null; locate: LocateSymbol }) {
  const app = useApp()
  const { show } = useView()
  const [shown, setShown] = useState<Shown | null>(null)
  const [peeking, setPeeking] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const latest = useRef({ locate, shown })
  latest.current = { locate, shown }

  useEffect(() => {
    let wait = 0
    let leave = 0
    let asked = ''
    const hide = () => {
      asked = ''
      setShown(null)
      setPeeking(false)
    }
    const onMove = (event: MouseEvent) => {
      const current = latest.current.shown
      const inCard = card.current?.contains(event.target as Node) ?? false
      if (current) {
        const r = current.rect
        const onWord =
          event.clientX >= r.left - 2 &&
          event.clientX <= r.right + 2 &&
          event.clientY >= r.top - 2 &&
          event.clientY <= r.bottom + 2
        if (onWord || inCard) {
          clearTimeout(leave)
          leave = 0
          return
        }
        if (!leave) leave = window.setTimeout(hide, GRACE_MS)
      }
      if (inCard) return
      clearTimeout(wait)
      const element = root()
      if (!element?.contains(event.target as Node) || event.buttons) return
      const { target: hit, clientX: x, clientY: y } = event
      wait = window.setTimeout(() => {
        const found = symbolAtPoint(hit, x, y)
        if (!found?.rect) return
        const target = targetOf(found, latest.current.locate)
        if (!target.at) return
        const at = target.at
        const key = spot({ ...target, at })
        if (key === asked) return
        asked = key
        const read = app.queryClient.fetchQuery(
          app.queries.git.hover({ ...at, ...(target.ref ? { ref: target.ref } : {}) }),
        )
        const rect = found.rect
        void read.then((hover) => {
          if (asked !== key) return
          if (!hover?.source || !hover.contents) return
          clearTimeout(leave)
          leave = 0
          setPeeking(false)
          setShown({ target: { ...target, at }, rect, hover })
        })
      }, DELAY_MS)
    }
    const onScroll = (event: Event) => {
      if (!card.current?.contains(event.target as Node)) hide()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    const onDown = (event: MouseEvent) => {
      if (!card.current?.contains(event.target as Node)) hide()
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      clearTimeout(wait)
      clearTimeout(leave)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('scroll', onScroll, { capture: true })
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [root, app])

  // While the float is open, gd, gr and gR act on its name, as they would in Neovim.
  const actions = useRef({ definition: () => {}, references: () => {}, uses: () => {} })
  useEffect(() => {
    if (!shown) return
    let g = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'g' && !g) {
        g = window.setTimeout(() => {
          g = 0
        }, 600)
        return
      }
      const run =
        g && { d: actions.current.definition, r: actions.current.references, R: actions.current.uses }[event.key]
      clearTimeout(g)
      g = 0
      if (!run) return
      event.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(g)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [shown])

  if (!shown) return null
  const { target, rect, hover } = shown
  const width = Math.min(WIDTH, window.innerWidth - 32)
  const close = () => {
    setShown(null)
    setPeeking(false)
  }
  const open = (location: LspLocation) => {
    const atRef = location.path === target.at.path
    openFile(app, location.path, { line: location.line, at: atRef ? target.ref : null })
    show('files')
    close()
  }
  const definition = () => {
    close()
    void goToDefinition(app, target, () => show('files'))
  }
  const references = () => setPeeking((now) => !now)
  const uses = () => {
    close()
    app.symbol.set(target)
  }
  actions.current = { definition, references, uses }
  // duck-ui's popover, anchored to a still box over the name: it flips above when there is no room below,
  // and its arrow points at the name.
  return (
    <Popover key={spot(target)} open onOpenChange={(next) => !next && close()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      </PopoverAnchor>
      <PopoverContent
        ref={card}
        aria-label={`About ${target.name}`}
        side="bottom"
        align="start"
        // A hover card leaves the keyboard where it was.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="flex flex-col p-0"
        style={{ width }}>
        {/* A slim line of actions on top, then the signature and its doc comment, as Neovim's hover float. */}
        <div className="flex h-7 shrink-0 items-center border-border border-b px-1 text-muted-foreground">
          <HoverAction keys="gd" label="Definition" onClick={definition} />
          <HoverAction keys="gr" label="References" pressed={peeking} onClick={references} />
          <HoverAction keys="gR" label="All uses" onClick={uses} />
          <span
            className="ms-auto truncate px-1.5"
            title={hover.source === 'nvim' ? 'Answered by a Neovim client' : 'Answered by a language server'}>
            {hover.source === 'nvim' ? 'Neovim' : hover.server}
          </span>
        </div>
        <div className="max-h-[min(28rem,60vh)] overflow-y-auto px-2.5 py-1.5">
          <Markdown text={hover.contents ?? ''} float />
        </div>
        {peeking ? (
          <div className="border-border border-t">
            <Peek target={target} onOpen={open} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function HoverAction({
  keys,
  label,
  pressed,
  onClick,
}: {
  keys: string
  label: string
  pressed?: boolean
  onClick(): void
}) {
  const inner = (
    <>
      <span className="text-tn-blue">{keys}</span>
      {label}
    </>
  )
  if (pressed === undefined)
    return (
      <Button variant="ghost" size="none" type="button" onClick={onClick} className="h-6 gap-1.5 rounded-sm px-1.5">
        {inner}
      </Button>
    )
  return (
    <Toggle size="sm" pressed={pressed} onPressedChange={onClick} className="h-6 min-w-0 gap-1.5 rounded-sm px-1.5">
      {inner}
    </Toggle>
  )
}
