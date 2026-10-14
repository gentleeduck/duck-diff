import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWebHandler } from '../web'

const dir = mkdtempSync(join(tmpdir(), 'duck-diff-web-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function asset(name: string, contents: string) {
  const path = join(dir, name.replaceAll('/', '_'))
  writeFileSync(path, contents)
  return path
}

const serve = createWebHandler({
  '/index.html': asset('index.html', '<div id="root"></div>'),
  '/assets/app-abc123.js': asset('app.js', 'console.log(1)'),
  '/assets/app-abc123.css': asset('app.css', 'body{}'),
  '/assets/font-x.woff2': asset('font.woff2', 'w'),
})

describe('createWebHandler', () => {
  it('serves index.html for / without caching', async () => {
    const response = serve('/')
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toContain('id="root"')
  })

  it('serves hashed assets with their type and long caching', async () => {
    const js = serve('/assets/app-abc123.js')
    expect(js.headers.get('content-type')).toContain('javascript')
    expect(js.headers.get('cache-control')).toContain('immutable')
    expect(serve('/assets/app-abc123.css').headers.get('content-type')).toContain('text/css')
    expect(serve('/assets/font-x.woff2').headers.get('content-type')).toBe('font/woff2')
  })

  it('falls back to index.html for unknown paths so client routes load', async () => {
    const response = serve('/some/client/route')
    expect(await response.text()).toContain('id="root"')
  })

  it('answers 404 for missing hashed assets instead of returning html', () => {
    expect(serve('/assets/missing.js').status).toBe(404)
  })
})
