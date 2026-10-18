// Hands the keyboard to a terminal's shell, once its pane has drawn.
export function focusTerminal(key: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-terminal="${CSS.escape(key)}"] textarea`)?.focus(),
  )
}
