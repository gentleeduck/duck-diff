import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moveOldData } from '../move-home'

describe('moveOldData', () => {
  let root: string
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const write = (path: string, text: string) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }

  it('moves settings, comments and undo snapshots into the one home, dropping empty repo folders', () => {
    root = mkdtempSync(join(tmpdir(), 'duck-move-'))
    const env = { XDG_DATA_HOME: join(root, 'share'), XDG_CACHE_HOME: join(root, 'cache') }
    const home = join(root, '.duck-diff')
    write(join(root, 'share/duck-diff/state.json'), '{"version":1}')
    write(join(root, 'share/duck-diff/repos.json'), '["/r"]')
    write(join(root, 'share/duck-diff/a1/reviews.json'), '[{"body":"keep me"}]')
    mkdirSync(join(root, 'share/duck-diff/empty'), { recursive: true })
    write(join(root, 'cache/duck-diff/a1/undo/1/a.txt'), 'before')

    expect(moveOldData(home, env)).toBeGreaterThan(0)

    expect(readFileSync(join(home, 'a1/reviews.json'), 'utf8')).toContain('keep me')
    expect(readFileSync(join(home, 'repos.json'), 'utf8')).toBe('["/r"]')
    expect(existsSync(join(home, 'state.json'))).toBe(true)
    expect(readFileSync(join(home, 'a1/undo/1/a.txt'), 'utf8')).toBe('before')
    expect(existsSync(join(home, 'empty'))).toBe(false)
    // Nothing is left behind in the old folders.
    expect(existsSync(join(root, 'share/duck-diff'))).toBe(false)
    expect(existsSync(join(root, 'cache/duck-diff'))).toBe(false)
  })

  it('keeps the newer of two copies, so a server still on an older build loses nothing, and runs once', () => {
    root = mkdtempSync(join(tmpdir(), 'duck-move-'))
    const env = { XDG_DATA_HOME: join(root, 'share'), XDG_CACHE_HOME: join(root, 'cache') }
    const home = join(root, '.duck-diff')
    write(join(home, 'repos.json'), '["/moved"]')
    write(join(home, 'state.json'), '{"newer":"home"}')
    write(join(root, 'share/duck-diff/repos.json'), '["/written-later"]')
    write(join(root, 'share/duck-diff/state.json'), '{"older":"old"}')
    const past = new Date(Date.now() - 60_000)
    utimesSync(join(home, 'repos.json'), past, past)
    utimesSync(join(root, 'share/duck-diff/state.json'), past, past)
    moveOldData(home, env)
    expect(readFileSync(join(home, 'repos.json'), 'utf8')).toBe('["/written-later"]')
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe('{"newer":"home"}')
    expect(existsSync(join(root, 'share/duck-diff'))).toBe(false)
    expect(moveOldData(home, env)).toBe(0)
  })
})
