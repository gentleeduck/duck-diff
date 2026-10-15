const running = new WeakMap<HTMLElement, number>()
const easeOut = (t: number) => 1 - (1 - t) ** 3

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Scrolls quickly but visibly to a position: a short eased glide, like Neovim's smooth-scroll plugins.
// A far target first jumps to two screens away, so long moves never crawl.
export function glide(element: HTMLElement, top: number, ms = 140): Promise<void> {
  const previous = running.get(element)
  if (previous !== undefined) cancelAnimationFrame(previous)
  if (reduced()) {
    element.scrollTop = top
    return Promise.resolve()
  }
  const reach = element.clientHeight * 2
  if (Math.abs(top - element.scrollTop) > reach) element.scrollTop = top - Math.sign(top - element.scrollTop) * reach
  const from = element.scrollTop
  const start = performance.now()
  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      element.scrollTop = t >= 1 ? top : from + (top - from) * easeOut(t)
      if (t < 1) running.set(element, requestAnimationFrame(step))
      else {
        running.delete(element)
        resolve()
      }
    }
    running.set(element, requestAnimationFrame(step))
  })
}
