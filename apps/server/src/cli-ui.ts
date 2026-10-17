// How every command looks, in duck-cli's style: the name and version over a green rule, then a line per step.
// On a terminal a running step spins, a download draws its bar on a line of its own under it, and both give
// way to the result; piped, only results print. install.sh and the Neovim plugin draw the same.

export function paintFor(stream: { isTTY?: boolean } = process.stdout, env = process.env): boolean {
  return Boolean(stream.isTTY) && !env.NO_COLOR && env.TERM !== 'dumb'
}

export const ansi = (code: string, color: boolean) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)

export function header(version: string, color: boolean): [string, string] {
  const title = ` 🦆 @gentleduck/diff ${version}`
  // The duck is two columns wide and two UTF-16 units long, so length is the width.
  return [ansi('37', color)(title), ansi('1;32', color)('─'.repeat(title.length))]
}

const UNITS = ['B', 'KB', 'MB', 'GB']

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`
}

function timeLeft(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return whole < 60 ? `${whole}s left` : `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s left`
}

export function progressText({
  done,
  total,
  elapsedMs,
  width = 24,
}: {
  done: number
  total: number | null
  elapsedMs: number
  width?: number
}): string {
  const rate = done / (Math.max(elapsedMs, 1) / 1000)
  const speed = `${formatBytes(Math.round(rate))}/s`
  if (!total) return `${formatBytes(done)}  ${speed}`
  const fraction = Math.min(1, done / total)
  const share = `${Math.floor(fraction * 100)}%`.padStart(4)
  const rest = `${share}  ${formatBytes(done)} / ${formatBytes(total)}  ${speed}${rate > 0 ? `  ${timeLeft((total - done) / rate)}` : ''}`
  // Too little room for a bar that reads as one; the numbers alone say the same.
  if (width < 6) return rest.trimStart()
  const filled = Math.round(fraction * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${rest}`
}

export interface Step {
  progress(done: number, total: number | null): void
  done(result: string): void
  fail(result: string): void
}

export interface Reporter {
  step(text: string): Step
  ok(text: string): void
  fail(text: string): void
  note(text: string): void
  blank(): void
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const CLEAR = '\r\x1b[2K'
// Clears the bar's line, then the step's line above it.
const CLEAR_TWO = `${CLEAR}\x1b[1A${CLEAR}`

export function createReporter({
  out,
  color,
  live,
  width = process.stdout.columns || 80,
}: {
  out: { write(chunk: string): void }
  color: boolean
  // A terminal someone watches: steps spin and progress redraws in place.
  live: boolean
  width?: number
}): Reporter {
  const green = ansi('32', color)
  const red = ansi('31', color)
  const cyan = ansi('36', color)
  const dim = ansi('2', color)
  const line = (text: string) => out.write(`${text}\n`)

  return {
    step(text) {
      const started = Date.now()
      let frame = 0
      let received: { done: number; total: number | null } | null = null
      let progressDrawn = 0
      let lines = 0
      const clear = () => (lines === 2 ? CLEAR_TWO : CLEAR)
      const draw = () => {
        // Each line kept within one row, or the next redraw would leave the wrapped part behind.
        const head = `${cyan(SPINNER[frame % SPINNER.length] as string)} ${text.slice(0, Math.max(10, width - 3))}`
        if (!received) {
          out.write(`${clear()}${head}`)
          lines = 1
          return
        }
        // The bar takes what its row has left after the indent and the numbers beside it (about 48 columns).
        const bar = progressText({ ...received, elapsedMs: Date.now() - started, width: Math.min(28, width - 2 - 48) })
        out.write(`${clear()}${head}\n${CLEAR}  ${dim(bar).slice(0, Math.max(10, width - 3 + (color ? 8 : 0)))}`)
        lines = 2
      }
      const timer = live
        ? setInterval(() => {
            frame++
            draw()
          }, 80)
        : null
      if (live) draw()
      const finish = (result: string) => {
        if (timer) clearInterval(timer)
        out.write(live ? `${clear()}${result}\n` : `${result}\n`)
      }
      return {
        progress(done, total) {
          received = { done, total }
          // A download reports every chunk; the line is redrawn at most every 50ms, and the spinner keeps it fresh.
          if (live && Date.now() - progressDrawn >= 50) {
            progressDrawn = Date.now()
            draw()
          }
        },
        done: (result) => finish(`${green('✔')} ${result}`),
        fail: (result) => finish(`${red('✖')} ${result}`),
      }
    },
    ok: (text) => line(`${green('✔')} ${text}`),
    fail: (text) => line(`${red('✖')} ${text}`),
    note: (text) => line(`  ${dim(text)}`),
    blank: () => out.write('\n'),
  }
}
