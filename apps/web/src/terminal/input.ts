// The shells on the page by tab key, so keys the page held (the first Esc of <Esc><Esc>) can still reach
// the one that has focus.
const senders = new Map<string, (data: string) => void>()

export function registerTerminal(key: string, send: (data: string) => void): () => void {
  senders.set(key, send)
  return () => {
    if (senders.get(key) === send) senders.delete(key)
  }
}

export function focusedTerminal(): string | null {
  const host = document.activeElement?.closest<HTMLElement>('[data-terminal]')
  return host?.dataset.terminal ?? null
}

export function sendToTerminal(key: string, data: string) {
  senders.get(key)?.(data)
}

export function focusTerminal(key: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-terminal="${CSS.escape(key)}"] textarea`)?.focus(),
  )
}
