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

  it('draws a download as a bar, a share, the sizes and the speed', () => {
    const line = progressText({ done: 40 * 1024 * 1024, total: 80 * 1024 * 1024, elapsedMs: 4000, width: 10 })
    expect(line).toBe('█████░░░░░  50%  40.0 MB / 80.0 MB  10.0 MB/s')
    expect(progressText({ done: 3 * 1024 * 1024, total: null, elapsedMs: 1000, width: 10 })).toBe('3.0 MB  3.0 MB/s')
    // A narrow terminal gets the numbers without the bar.
    expect(progressText({ done: 1024, total: 4096, elapsedMs: 1000, width: 3 })).toBe('25%  1.0 KB / 4.0 KB  1.0 KB/s')
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

  it('redraws one line live while a step runs, then leaves its result', () => {
    const out = sink()
    const report = createReporter({ out, color: false, live: true, width: 120 })
    const download = report.step('Downloading duck-diff-linux-x64')
    download.progress(1024 * 1024, 2 * 1024 * 1024)
    download.done('Downloaded 2.0 MB')
    const text = out.text()
    expect(text).toContain('Downloading duck-diff-linux-x64')
    expect(text).toContain(' 50% ')
    expect(text).toContain('\r\x1b[2K')
    expect(text.endsWith('\r\x1b[2K✔ Downloaded 2.0 MB\n')).toBe(true)
  })
})
