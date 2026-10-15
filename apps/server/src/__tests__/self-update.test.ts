import { describe, expect, it } from 'bun:test'
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildStamp, watchBinary } from '../self-update'

describe('watchBinary', () => {
  it('fires once when a new build is moved over the binary, and not for an empty file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'duck-diff-bin-'))
    const bin = join(dir, 'duck-diff')
    writeFileSync(bin, 'old')
    const before = buildStamp(bin)
    let fired = 0
    const stop = watchBinary(bin, () => fired++, 20)
    try {
      writeFileSync(join(dir, 'next'), 'new build')
      renameSync(join(dir, 'next'), bin)
      await Bun.sleep(150)
      writeFileSync(bin, 'newer still')
      await Bun.sleep(150)
      expect(fired).toBe(1)
      expect(buildStamp(bin)).not.toBe(before)
      expect(buildStamp(join(dir, 'missing'))).toBe('unknown')
    } finally {
      stop()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
