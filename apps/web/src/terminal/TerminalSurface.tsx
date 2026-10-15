import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { Settings } from '../state/settings'
import type { Mounted, Terminal } from './xterm'

const selectFontSize = (settings: Settings) => settings.fontSize

interface SurfaceProps {
  label: string
  readOnly?: boolean
  // Connects the terminal to what it shows; returns the cleanup. Runs again when it changes.
  attach(terminal: Terminal): () => void
  // Takes the keyboard when it mounts, like a freshly opened terminal pane.
  autoFocus?: boolean
}

// xterm.js is loaded on first use so a page that never opens the panel never pays for it.
export function TerminalSurface({ label, readOnly = false, attach, autoFocus = false }: SurfaceProps) {
  const { settings } = useApp()
  const fontSize = useStore(settings, selectFontSize)
  const host = useRef<HTMLElement>(null)
  const current = useRef<Mounted | null>(null)
  // Read at mount; later changes are applied below without rebuilding the terminal.
  const size = useRef(fontSize)
  size.current = fontSize

  useEffect(() => {
    const element = host.current
    if (!element) return
    let disposed = false
    let cleanup = () => {}
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => mounted?.fit())
    })
    let mounted: Mounted | null = null
    import('./xterm')
      .then(({ mountTerminal }) => {
        if (disposed) return
        mounted = mountTerminal(element, { fontSize: size.current, readOnly })
        current.current = mounted
        observer.observe(element)
        cleanup = attach(mounted.terminal)
        if (autoFocus) mounted.terminal.focus()
      })
      .catch(() => {})
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      cleanup()
      mounted?.dispose()
      current.current = null
    }
  }, [attach, readOnly, autoFocus])

  useEffect(() => {
    const mounted = current.current
    if (!mounted) return
    mounted.terminal.options.fontSize = fontSize
    mounted.fit()
  }, [fontSize])

  return <section aria-label={label} ref={host} className="h-full min-h-0 w-full overflow-hidden ps-2 pt-1" />
}
