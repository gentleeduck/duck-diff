import { useEffect, useRef } from 'react'
import { useApp } from '../app/AppProvider'
import { useStore } from '../lib/store'
import type { Settings } from '../state/settings'
import type { Mounted, Terminal } from './xterm'

const selectFontSize = (settings: Settings) => settings.fontSize
const selectWeight = (settings: Settings) => settings.fontWeight
const selectTheme = (settings: Settings) => settings.theme

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
  const fontWeight = useStore(settings, selectWeight)
  const theme = useStore(settings, selectTheme)
  const host = useRef<HTMLElement>(null)
  const current = useRef<Mounted | null>(null)
  // Read at mount; later changes are applied below without rebuilding the terminal.
  const size = useRef({ fontSize, fontWeight })
  size.current = { fontSize, fontWeight }
  const focus = useRef(autoFocus)
  focus.current = autoFocus

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
        mounted = mountTerminal(element, { ...size.current, readOnly })
        current.current = mounted
        observer.observe(element)
        cleanup = attach(mounted.terminal)
        if (focus.current) mounted.terminal.focus()
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
  }, [attach, readOnly])

  useEffect(() => {
    if (autoFocus) current.current?.terminal.focus()
  }, [autoFocus])

  useEffect(() => {
    const mounted = current.current
    if (!mounted) return
    mounted.terminal.options.fontSize = fontSize
    mounted.terminal.options.fontWeight = fontWeight
    mounted.fit()
  }, [fontSize, fontWeight])

  // The theme lands on <html> in an effect of its own; reading the colors a frame later sees the new ones.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the theme is the trigger
  useEffect(() => {
    const frame = requestAnimationFrame(() => current.current?.retheme())
    return () => cancelAnimationFrame(frame)
  }, [theme])

  return <section aria-label={label} ref={host} className="h-full min-h-0 w-full overflow-hidden ps-2 pt-1" />
}
