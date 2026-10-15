// Work that can wait until the page has drawn what it opened with, so its requests never queue in front
// of the diff (a browser runs six at a time per server).
export function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 1500 })
    return () => cancelIdleCallback(id)
  }
  const timer = setTimeout(run, 300)
  return () => clearTimeout(timer)
}
