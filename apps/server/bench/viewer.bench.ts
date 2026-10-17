// Performance budgets from the spec, measured against the compiled binary in headless Chromium.
// Run with `bun run bench` after `bun run build`; exits 1 when a budget is missed.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HandshakeSchema } from '@duck-diff/protocol'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { chromium, type Page } from '@playwright/test'

const BINARY = new URL('../dist/duck-diff', import.meta.url).pathname
const UNSTAGED = `&target=${encodeURIComponent(JSON.stringify({ kind: 'unstaged' }))}`

interface Result {
  name: string
  value: number
  unit: string
  budget: number
}

function lines(count: number, tag: string): string {
  return Array.from({ length: count }, (_, i) => `export const value${i} = '${tag} ${i}'`).join('\n')
}

// 1,000 changed files with a two-line change each.
function wideRepo(): TestRepo {
  const repo = createRepo()
  for (let i = 0; i < 1000; i++) repo.write(`src/module-${String(i).padStart(4, '0')}.ts`, `${lines(20, 'a')}\n`)
  repo.commit('base')
  for (let i = 0; i < 1000; i++) {
    repo.write(`src/module-${String(i).padStart(4, '0')}.ts`, `${lines(20, 'a').replace("'a 3'", "'b 3'")}\n`)
  }
  return repo
}

// 50,000 changed lines across 25 files, each under the size that starts folded.
function tallRepo(): TestRepo {
  const repo = createRepo()
  for (let i = 0; i < 25; i++) repo.write(`src/table-${i}.ts`, `${lines(2000, 'a')}\n`)
  repo.commit('base')
  for (let i = 0; i < 25; i++) repo.write(`src/table-${i}.ts`, `${lines(2000, 'b')}\n`)
  return repo
}

// A small repo next to a large ignored tree, like an app with its node_modules installed.
function ignoredTreeRepo(): TestRepo {
  const repo = createRepo()
  repo.write('.gitignore', 'node_modules/\n')
  repo.write('src/app.ts', 'export const a = 1\n')
  for (let i = 0; i < 3000; i++) repo.write(`node_modules/pkg-${i}/lib/index.js`, 'module.exports = 1\n')
  repo.commit('base')
  return repo
}

async function serverStart(repo: TestRepo): Promise<number> {
  const started = performance.now()
  const server = await serve(repo)
  const elapsed = performance.now() - started
  server.stop()
  return elapsed
}

async function serve(repo: TestRepo) {
  const home = mkdtempSync(join(tmpdir(), 'duck-diff-bench-'))
  const env = {
    ...process.env,
    XDG_DATA_HOME: join(home, 'data'),
    DUCK_DIFF_HOME: join(home, 'duck-diff'),
    HISTFILE: '/dev/null',
    // Shared across runs: the TypeScript server writes its typings cache after the server is gone.
    XDG_CACHE_HOME: join(tmpdir(), 'duck-diff-test-cache'),
    SHELL: '/bin/sh',
  }
  const child = spawn(BINARY, ['serve', '--repo', repo.path], { stdio: ['pipe', 'pipe', 'inherit'], env })
  const [chunk] = (await once(child.stdout, 'data')) as [Buffer]
  const { url } = HandshakeSchema.parse(JSON.parse(chunk.toString().split('\n')[0] ?? ''))
  return {
    url,
    stop() {
      child.kill()
      rmSync(home, { recursive: true, force: true })
      repo.cleanup()
    },
  }
}

// Records, from the first frame on, when the first diff line is painted.
const WATCH_FIRST_ROW = () => {
  const tick = () => {
    if (document.querySelector('[data-row="row"]')) {
      ;(window as unknown as { firstRow: number }).firstRow = performance.now()
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function firstPaint(page: Page, url: string): Promise<number> {
  await page.addInitScript(WATCH_FIRST_ROW)
  await page.goto(url + UNSTAGED)
  await page.waitForFunction(() => (window as unknown as { firstRow?: number }).firstRow !== undefined, null, {
    timeout: 30_000,
  })
  return page.evaluate(() => {
    const list = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/api/files'))
    const firstRow = (window as unknown as { firstRow: number }).firstRow
    return firstRow - (list as PerformanceResourceTiming).responseEnd
  })
}

async function heapAfterLoad(page: Page, url: string): Promise<number> {
  await page.goto(url + UNSTAGED)
  await page.getByRole('banner').getByText('25 files').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(2000)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('Performance.enable')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const heap = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0
  return heap / (1024 * 1024)
}

// Scrolls the viewer a fixed distance every frame for two seconds and reports the median frame time.
async function scrollFrames(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const target = document.querySelector('[data-diff-view]') as HTMLElement
    const frames: number[] = []
    let last = performance.now()
    const end = last + 2000
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        frames.push(now - last)
        last = now
        target.scrollTop += 120
        if (now < end) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    frames.sort((a, b) => a - b)
    return frames[Math.floor(frames.length / 2)] ?? 0
  })
}

// Prints 200,000 lines in a page terminal and reports the median frame time while they arrive.
async function terminalFlood(page: Page, url: string): Promise<number> {
  await page.goto(url)
  await page.getByRole('button', { name: 'Output' }).waitFor()
  await page.keyboard.press('Control+`')
  await page.getByRole('button', { name: 'New terminal' }).click()
  const terminal = page.getByRole('region', { name: 'Terminal 1' }).locator('.xterm')
  await terminal.waitFor()
  await terminal.click()
  await page.waitForTimeout(300)
  const frames = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const times: number[] = []
        let last = performance.now()
        const end = last + 2000
        const step = (now: number) => {
          times.push(now - last)
          last = now
          if (now < end) requestAnimationFrame(step)
          else {
            times.sort((a, b) => a - b)
            resolve(times[Math.floor(times.length / 2)] ?? 0)
          }
        }
        requestAnimationFrame(step)
      }),
  )
  await page.keyboard.type('seq 200000\n')
  return frames
}

async function main() {
  const browser = await chromium.launch()
  const results: Result[] = []
  try {
    results.push({
      name: 'Server start, 6,000 ignored folders',
      value: await serverStart(ignoredTreeRepo()),
      unit: 'ms',
      budget: 150,
    })
    const wide = await serve(wideRepo())
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      results.push({
        name: 'First diff row, 1,000 files',
        value: await firstPaint(page, wide.url),
        unit: 'ms',
        budget: 300,
      })
      await page.close()
    } finally {
      wide.stop()
    }

    const tall = await serve(tallRepo())
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      results.push({
        name: 'JS heap, 50,000-line diff',
        value: await heapAfterLoad(page, tall.url),
        unit: 'MB',
        budget: 300,
      })
      results.push({ name: 'Median frame while scrolling', value: await scrollFrames(page), unit: 'ms', budget: 17 })
      results.push({
        name: 'Median frame, 200,000-line shell',
        value: await terminalFlood(page, tall.url),
        unit: 'ms',
        budget: 17,
      })
      await page.close()
    } finally {
      tall.stop()
    }
  } finally {
    await browser.close()
  }

  let failed = false
  for (const { name, value, unit, budget } of results) {
    const ok = value <= budget
    failed ||= !ok
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(32)} ${value.toFixed(1).padStart(8)} ${unit} (budget ${budget} ${unit})`,
    )
  }
  process.exit(failed ? 1 : 0)
}

await main()
