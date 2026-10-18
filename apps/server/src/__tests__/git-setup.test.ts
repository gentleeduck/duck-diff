import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGit } from '@duck-diff/git'
import { gitSetup, gitSetupOff } from '../git-setup'

let dir: string
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// A global config of the test's own; the user's is never read or written.
function sandbox() {
  dir = mkdtempSync(join(tmpdir(), 'duck-git-setup-'))
  const config = join(dir, 'gitconfig')
  const get = async (key: string) =>
    (await runGit(['config', '--file', config, '--get', key], { cwd: dir, okExitCodes: [1] }).catch(() => '')).trim() ||
    null
  const put = (key: string, value: string) => runGit(['config', '--file', config, key, value], { cwd: dir })
  return { config, home: join(dir, 'home'), get, put }
}

describe('git-setup', () => {
  it('makes duck-diff git merge tool, diff tool and rebase editor where nothing else is chosen', async () => {
    const { config, home, get } = sandbox()
    await gitSetup('duck-diff', home, config)
    expect(await get('merge.tool')).toBe('duck-diff')
    expect(await get('mergetool.duck-diff.cmd')).toBe('duck-diff mergetool "$MERGED"')
    expect(await get('mergetool.duck-diff.trustExitCode')).toBe('true')
    expect(await get('diff.tool')).toBe('duck-diff')
    expect(await get('difftool.duck-diff.cmd')).toBe('duck-diff difftool "$LOCAL" "$REMOTE" "$MERGED"')
    expect(await get('sequence.editor')).toBe('duck-diff rebase-todo')
    expect(await get('mergetool.prompt')).toBe('false')
    expect(await get('mergetool.keepBackup')).toBe('false')
  })

  it("keeps the user's own choices, and --off takes back only what it set", async () => {
    const { config, home, get, put } = sandbox()
    await put('merge.tool', 'meld')
    await put('mergetool.prompt', 'true')
    const { kept } = await gitSetup('duck-diff', home, config)
    expect(kept).toEqual([
      { key: 'merge.tool', value: 'meld' },
      { key: 'mergetool.prompt', value: 'true' },
    ])
    expect(await get('merge.tool')).toBe('meld')
    expect(await get('mergetool.duck-diff.cmd')).toBe('duck-diff mergetool "$MERGED"')

    await gitSetupOff(home, config)
    expect(await get('merge.tool')).toBe('meld')
    expect(await get('mergetool.prompt')).toBe('true')
    expect(await get('mergetool.duck-diff.cmd')).toBeNull()
    expect(await get('diff.tool')).toBeNull()
    expect(await get('sequence.editor')).toBeNull()
    expect(await get('mergetool.keepBackup')).toBeNull()
  })

  it('points its own entries at a moved binary when run again', async () => {
    const { config, home, get } = sandbox()
    await gitSetup('/old/duck-diff', home, config)
    await gitSetup('/new/duck-diff', home, config)
    expect(await get('mergetool.duck-diff.cmd')).toBe('/new/duck-diff mergetool "$MERGED"')
    expect(await get('sequence.editor')).toBe('/new/duck-diff rebase-todo')
  })
})
