// Lists the arrows walk: trees, list boxes, tab strips, menus and plain lists of buttons.
const LISTS =
  '[role="tree"], [role="treegrid"], [role="listbox"], [role="grid"], [role="tablist"], [role="menu"], [role="radiogroup"], [role="list"], ul, ol'
const ITEMS =
  '[role="treeitem"], [role="option"], [role="row"], [role="tab"], [role="menuitem"], [role="radio"], li > button, li > a[href], li > [tabindex], li[tabindex]'
export type Motion = 'down' | 'up' | 'first' | 'last'

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

// Focus along a plain list's items, for lists that do not move with the arrows themselves.
export function move(motion: Motion, from: Element | null = deepActive()): boolean {
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

// From nothing focused, the down arrow starts on the first item of the main area's first list.
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
