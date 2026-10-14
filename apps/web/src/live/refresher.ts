// Coalesces change notifications into reloads: one per quiet window, never two at once,
// and at most one queued behind a reload that is still running.
export function createRefresher(reload: () => Promise<void>, debounceMs = 150) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let queued = false
  let disposed = false

  async function run() {
    timer = null
    if (disposed) return
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      await reload()
    } finally {
      running = false
      if (queued && !disposed) {
        queued = false
        void run()
      }
    }
  }

  return {
    notify() {
      if (disposed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, debounceMs)
    },
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
    },
  }
}
