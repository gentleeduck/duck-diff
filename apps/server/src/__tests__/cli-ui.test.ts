import { describe, expect, it } from 'bun:test'
import { createReporter, formatBytes, header, progressText } from '../cli-ui'

const sink = () => {
  let text = ''
  return {
    write: (chunk: string) => {
      text += chunk
    },
    text: () => text,
  }
}

describe('cli look', () => {
  it('heads every command with the name, the version and a rule as wide as both', () => {
    const [title, rule] = header('1.2.3', false)
    expect(title).toBe(' 🦆 @gentleduck/diff 1.2.3')
    expect(rule).toBe('─'.repeat((title as string).length))
  })

  it('writes sizes the way a person reads them', () => {
    expect([formatBytes(512), formatBytes(1536), formatBytes(101_082_726)]).toEqual(['512 B', '1.5 KB', '96.4 MB'])
  })

  it('draws a download as a bar, a share, the sizes, the speed and the time left', () => {
    const line = progressText({ done: 40 * 1024 * 1024, total: 80 * 1024 * 1024, elapsedMs: 4000, width: 10 })
    expect(line).toBe('█████░░░░░  50%  40.0 MB / 80.0 MB  10.0 MB/s  4s left')
    expect(progressText({ done: 1024 * 1024, total: 200 * 1024 * 1024, elapsedMs: 1000, width: 4 })).toMatch(
      / {2}3m 19s left$/,
    )
    expect(progressText({ done: 3 * 1024 * 1024, total: null, elapsedMs: 1000, width: 10 })).toBe('3.0 MB  3.0 MB/s')
    // A narrow terminal gets the numbers without the bar.
    expect(progressText({ done: 1024, total: 4096, elapsedMs: 1000, width: 3 })).toBe(
      '25%  1.0 KB / 4.0 KB  1.0 KB/s  3s left',
    )
  })
})

describe('reporter', () => {
  it('prints one plain line per finished step when nothing reads it live', () => {
    const out = sink()
    const report = createReporter({ out, color: false, live: false })
    const find = report.step('Finding the latest release')
    find.done('Found 0.5.2')
    const download = report.step('Downloading')
    download.progress(5, 10)
    download.fail('the download failed')
    report.note('nothing changed')
    expect(out.text()).toBe('✔ Found 0.5.2\n✖ the download failed\n  nothing changed\n')
  })

  it('redraws a running step in place, then leaves its result', () => {
    const out = sink()
    const report = createReporter({ out, color: false, live: true, width: 80 })
    const find = report.step('Finding the latest release')
    expect(out.text()).toBe('\r\x1b[2K⠋ Finding the latest release')
    find.done('Found 0.5.2')
    expect(out.text().endsWith('\r\x1b[2K✔ Found 0.5.2\n')).toBe(true)
  })

  it("draws a download's bar on its own line under the step, and leaves only the result", () => {
    const out = sink()
    const report = createReporter({ out, color: false, live: true, width: 80 })
    const download = report.step('Downloading duck-diff-linux-x64')
    download.progress(1024 * 1024, 2 * 1024 * 1024)
    expect(out.text()).toContain('⠋ Downloading duck-diff-linux-x64\n\r\x1b[2K  █')
    expect(out.text()).toMatch(/█+░+ {2}50% {2}1\.0 MB \/ 2\.0 MB {2}/)
    download.done('Downloaded 2.0 MB')
    // Both lines go before the result takes their place.
    expect(out.text().endsWith('\r\x1b[2K\x1b[1A\r\x1b[2K✔ Downloaded 2.0 MB\n')).toBe(true)
  })
})
