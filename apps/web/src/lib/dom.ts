// The first match that is drawn: kept views and tabs behind the one showing stay in the page, hidden.
export function shown<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  for (const element of root.querySelectorAll<T>(selector)) if (element.checkVisibility?.() !== false) return element
  return null
}
