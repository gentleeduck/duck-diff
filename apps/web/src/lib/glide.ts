const running = new WeakMap<HTMLElement, number>()
// Leaves at about one and a half times its average speed and slows into place: fast enough to feel instant,
// gentle enough that the first frame reads as motion rather than a jump.
const easeOut = (t: number) => Math.sin((t * Math.PI) / 2)

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Scrolls to a position in a short glide the eye can follow, like Neovim's smooth-scroll plugins, a little longer
// for a longer way. A target over a screen and a half away jumps to one screen short first, so no glide crawls.
export function glide(element: HTMLElement, top: number, ms?: number): Promise<void> {
  const previous = running.get(element)
  if (previous !== undefined) cancelAnimationFrame(previous)
  if (reduced()) {
    element.scrollTop = top
    return Promise.resolve()
  }
  const screen = element.clientHeight || 1
  if (Math.abs(top - element.scrollTop) > screen * 1.5)
    element.scrollTop = top - Math.sign(top - element.scrollTop) * screen
  const from = element.scrollTop
  const duration = ms ?? 160 + 100 * Math.min(1, Math.abs(top - from) / screen)
  const start = performance.now()
  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
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
