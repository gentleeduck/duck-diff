import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearCaches, createDiskCache } from '../disk-cache'

describe('disk cache', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const fresh = () => {
    dir = mkdtempSync(join(tmpdir(), 'duck-cache-'))
    return dir
  }

  it('keeps values across a restart', async () => {
    const first = createDiskCache(fresh())
    first.set('commits', 'abc', { message: 'hi' })
    await first.flush()
    const second = createDiskCache(dir)
    expect(await second.get('commits', 'abc')).toEqual({ message: 'hi' })
    expect(await second.get('commits', 'nope')).toBeNull()
  })

  it('drops the least recently used entries past its size', async () => {
    const cache = createDiskCache(fresh(), { maxBytes: 200 })
    cache.set('b', 'one', 'x'.repeat(80))
    cache.set('b', 'two', 'y'.repeat(80))
    await cache.get('b', 'one')
    cache.set('b', 'three', 'z'.repeat(80))
    await cache.flush()
    const again = createDiskCache(dir, { maxBytes: 200 })
    expect(await again.get('b', 'one')).not.toBeNull()
    expect(await again.get('b', 'two')).toBeNull()
    expect(await again.get('b', 'three')).not.toBeNull()
  })

  it('ignores a corrupt or older file and writes a good one', async () => {
    mkdirSync(join(fresh(), 'cache'), { recursive: true })
    writeFileSync(join(dir, 'cache', 'b.json'), '{nope')
    const cache = createDiskCache(dir)
    expect(await cache.get('b', 'k')).toBeNull()
    cache.set('b', 'k', 1)
    await cache.flush()
    expect(await createDiskCache(dir).get('b', 'k')).toBe(1)
    writeFileSync(join(dir, 'cache', 'b.json'), JSON.stringify({ version: 0, entries: [['k', 2, 1]] }))
    expect(await createDiskCache(dir).get('b', 'k')).toBeNull()
  })

  it('clears a bucket or everything', async () => {
    const cache = createDiskCache(fresh())
    cache.set('a', 'k', 1)
    cache.set('b', 'k', 2)
    await cache.flush()
    await cache.clear('a')
    expect(await cache.get('a', 'k')).toBeNull()
    expect(await cache.get('b', 'k')).toBe(2)
    await cache.clear()
    expect(existsSync(join(dir, 'cache'))).toBe(false)
    expect(await cache.get('b', 'k')).toBeNull()
  })
})

describe('clearCaches', () => {
  let data: string
  afterEach(() => rmSync(data, { recursive: true, force: true }))

  it('removes one repo cache or all of them, keeping the rest of the data', async () => {
    data = mkdtempSync(join(tmpdir(), 'duck-data-'))
    for (const id of ['a1', 'b2']) {
      mkdirSync(join(data, id, 'cache'), { recursive: true })
      writeFileSync(join(data, id, 'reviews.json'), '[]')
    }
    expect(await clearCaches(data, null)).toBe(2)
    expect(existsSync(join(data, 'a1', 'cache'))).toBe(false)
    expect(existsSync(join(data, 'a1', 'reviews.json'))).toBe(true)
    expect(await clearCaches(data, null)).toBe(0)
  })
})
