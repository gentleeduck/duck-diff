// How every command looks, in duck-cli's style: the name and version over a green rule, then a line per step.
// On a terminal a running step spins and a download draws its progress in place; piped, only results print.

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
  const speed = `${formatBytes(Math.round(done / (Math.max(elapsedMs, 1) / 1000)))}/s`
  if (!total) return `${formatBytes(done)}  ${speed}`
  const fraction = Math.min(1, done / total)
  const share = `${Math.floor(fraction * 100)}%`.padStart(4)
  const rest = `${share}  ${formatBytes(done)} / ${formatBytes(total)}  ${speed}`
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
      const draw = () => {
        // The bar takes what the row has left after the text and the numbers beside it (about 36 columns).
        const room = width - 3 - text.length - 2 - 36
        const detail = received
          ? progressText({ ...received, elapsedMs: Date.now() - started, width: Math.min(24, room) })
          : ''
        const body = detail ? `${text}  ${detail}` : text
        // Kept within one row, or the next redraw would leave the wrapped part behind.
        out.write(
          `${CLEAR}${cyan(SPINNER[frame % SPINNER.length] as string)} ${body.slice(0, Math.max(10, width - 3))}`,
        )
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
        out.write(live ? `${CLEAR}${result}\n` : `${result}\n`)
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
