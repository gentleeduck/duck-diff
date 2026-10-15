import { glide } from '../lib/glide'

// Lists j and k walk: trees, list boxes, tab strips, menus and plain lists of buttons.
const LISTS =
  '[role="tree"], [role="treegrid"], [role="listbox"], [role="grid"], [role="tablist"], [role="menu"], [role="radiogroup"], [role="list"], ul, ol'
const ITEMS =
  '[role="treeitem"], [role="option"], [role="row"], [role="tab"], [role="menuitem"], [role="radio"], li > button, li > a[href], li > [tabindex], li[tabindex]'
const KEYS = { down: 'ArrowDown', up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', first: 'Home', last: 'End' }

export type Motion = keyof typeof KEYS

// The element that really has focus, through shadow roots (the file tree draws inside one).
export function deepActive(): Element | null {
  let element: Element | null = document.activeElement
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement
  return element
}

// The closest list around an element, crossing out of shadow roots.
export function listOf(element: Element | null): Element | null {
  for (let at: Element | null = element; at; ) {
    const found = at.closest(LISTS)
    if (found) return found
    const root = at.getRootNode()
    at = root instanceof ShadowRoot ? root.host : null
  }
  return null
}

// Kept views and tabs behind the one showing are in the page but not drawn; their lists are not reachable.
const usable = (item: HTMLElement) =>
  !item.hasAttribute('disabled') &&
  item.getAttribute('aria-disabled') !== 'true' &&
  !item.closest('[hidden], [inert]') &&
  item.checkVisibility?.() !== false

// A widget that knows its arrow keys (a tree, a menu, tabs) handles the motion itself; anything else gets
// focus moved along its items.
export function move(motion: Motion, from: Element | null = deepActive()): boolean {
  const target = from ?? document.body
  const event = new KeyboardEvent('keydown', { key: KEYS[motion], bubbles: true, cancelable: true, composed: true })
  target.dispatchEvent(event)
  if (event.defaultPrevented) return true
  if (motion === 'left' || motion === 'right') return false
  const list = listOf(from)
  if (!list) return false
  // Only this list's own items, not those of a list nested in it.
  const items = [...list.querySelectorAll<HTMLElement>(ITEMS)].filter(
    (item) => item.closest(LISTS) === list && usable(item),
  )
  if (!items.length) return false
  const current = items.findIndex((item) => item === from || item.contains(from))
  const index =
    motion === 'first'
      ? 0
      : motion === 'last'
        ? items.length - 1
        : Math.max(0, Math.min(items.length - 1, current + (motion === 'down' ? 1 : -1)))
  const next = items[current === -1 && motion === 'down' ? 0 : index]
  next?.focus()
  next?.scrollIntoView({ block: 'nearest' })
  return true
}

// Half a screen up or down in whatever scrolls around the focus, or the page's main area.
export function scrollHalf(direction: 1 | -1, from: Element | null = deepActive()) {
  let at: Element | null = from
  const scrolls = (element: Element): element is HTMLElement =>
    element instanceof HTMLElement &&
    element.scrollHeight > element.clientHeight + 1 &&
    /(auto|scroll)/.test(getComputedStyle(element).overflowY)
  while (at && !scrolls(at)) at = at.parentElement
  const main = document.querySelector('[data-region="main"]')
  const box = at ?? [...(main?.querySelectorAll('*') ?? [])].find(scrolls)
  if (box) void glide(box, Math.max(0, box.scrollTop + (direction * box.clientHeight) / 2))
}

// From nothing focused, j starts on the first item of the main area's first list.
export function enterList(region: Element | null): boolean {
  for (const list of region?.querySelectorAll(LISTS) ?? []) {
    const first = [...list.querySelectorAll<HTMLElement>(ITEMS)].find(
      (item) => item.closest(LISTS) === list && usable(item),
    )
    if (first) {
      first.focus()
      first.scrollIntoView({ block: 'nearest' })
      return true
    }
  }
  return false
}
