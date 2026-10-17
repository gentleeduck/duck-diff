const EDITING = new Set(['a', 'c', 'v', 'x', 'z', 'y'])

// Keys the browser would act on itself (print, save, find, history, downloads, bookmarks, the address bar, view
// source, developer tools, back and forward, the F keys) and the app has no use for. Reload stays, as do a text
// box's own select all, copy, cut, paste, undo and redo. Chrome keeps a few whatever a page does (Ctrl+W,
// Ctrl+T, Ctrl+N, Ctrl+Tab), so those still reach it.
export function isBrowserShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  editable: boolean,
) {
  const key = event.key.toLowerCase()
  const command = event.ctrlKey || event.metaKey
  if (key === 'f5' || (command && key === 'r')) return false
  if (/^f([1-9]|1[0-2])$/.test(key)) return true
  if (event.altKey && !command) return key === 'arrowleft' || key === 'arrowright' || key === 'home'
  if (!command) return false
  return !(editable && !event.altKey && EDITING.has(key))
}
