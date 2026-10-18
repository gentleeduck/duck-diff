import { useEffect } from 'react'
import { readKept, writeKept } from '../lib/kept'

// Scrolling areas that remember their place themselves (the diff, the graph, GitHub pages) carry this.
export const OWN_MEMORY = 'data-scroll-memory'
const AREAS = '.overflow-auto, .overflow-y-auto, .overflow-scroll, .overflow-y-scroll'
const RETRY_MS = 1500

// Every other scrolling area keeps its place across pages: side panels, trees, lists, previews. Each is
// named by the view and its label (the nearest aria-label), saved as it scrolls and put back the first
// time it shows again, retrying while its content is still arriving. A reload keeps them.
const KEPT = 'scroll-areas'
const places = new Map<string, number>(readKept<[string, number][]>(KEPT, []))
let saving: ReturnType<typeof setTimeout> | undefined
const save = () => {
  clearTimeout(saving)
  saving = setTimeout(() => writeKept(KEPT, [...places]), 300)
}

function nameOf(view: string, element: HTMLElement): string | null {
  const label = element.closest('[aria-label]')?.getAttribute('aria-label')
  return label ? `${view}|${label}` : null
}

export function ScrollKeeper({ view }: { view: string }) {
  useEffect(() => {
    const seen = new WeakSet<HTMLElement>()
    const restoring = new WeakSet<HTMLElement>()
    const onScroll = (event: Event) => {
      const element = event.target
      if (!(element instanceof HTMLElement) || restoring.has(element) || element.closest(`[${OWN_MEMORY}]`)) return
      const name = nameOf(view, element)
      if (!name) return
      places.set(name, element.scrollTop)
      save()
    }
    const restore = (element: HTMLElement, top: number) => {
      restoring.add(element)
      const started = Date.now()
      const step = () => {
        element.scrollTop = top
        if (Math.abs(element.scrollTop - top) > 1 && Date.now() - started < RETRY_MS) setTimeout(step, 50)
        else setTimeout(() => restoring.delete(element), 50)
      }
      step()
    }
    let queued = false
    const scan = () => {
      queued = false
      for (const element of document.querySelectorAll<HTMLElement>(AREAS)) {
        if (seen.has(element) || element.closest(`[${OWN_MEMORY}]`)) continue
        seen.add(element)
        const name = nameOf(view, element)
        const top = name ? places.get(name) : undefined
        if (top) restore(element, top)
      }
    }
    const onChange = () => {
      if (queued) return
      queued = true
      setTimeout(scan, 16)
    }
    scan()
    const observer = new MutationObserver(onChange)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [view])
  return null
}
