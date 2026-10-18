import { describe, expect, it } from 'bun:test'
import { parseArgs } from '../args'

describe('parseArgs', () => {
  it('defaults serve to the cwd, a random port and ten minutes idle', () => {
    expect(parseArgs(['serve'], '/work')).toEqual({
      name: 'serve',
      repo: '/work',
      more: [],
      port: 0,
      idleTimeoutMs: 600_000,
      nvim: null,
      terminal: true,
    })
  })

  it('reads flags', () => {
    expect(
      parseArgs(
        ['serve', '--repo', '/r', '--port', '4100', '--idle-timeout-ms', '5000', '--nvim', '/tmp/nvim.sock'],
        '/work',
      ),
    ).toEqual({
      name: 'serve',
      more: [],
      repo: '/r',
      port: 4100,
      idleTimeoutMs: 5000,
      nvim: '/tmp/nvim.sock',
      terminal: true,
    })
  })

  it('reads cache clear, for one repo or every one', () => {
    expect(parseArgs(['cache', 'clear'], '/w')).toEqual({ name: 'cache-clear', repo: null })
    expect(parseArgs(['cache', 'clear', '--repo', 'r'], '/w')).toEqual({ name: 'cache-clear', repo: '/w/r' })
    expect(() => parseArgs(['cache', 'drop'], '/w')).toThrow(/usage: duck-diff cache clear/)
  })

  it('turns the page terminals off', () => {
    expect(parseArgs(['serve', '--no-terminal', '--port', '1'], '/w')).toMatchObject({ port: 1, terminal: false })
  })

  it('handles version and help, for the tool or one command', () => {
    expect(parseArgs(['--version'], '/')).toEqual({ name: 'version' })
    expect(parseArgs(['-v'], '/')).toEqual({ name: 'version' })
    expect(parseArgs(['--help'], '/')).toEqual({ name: 'help', topic: null })
    expect(parseArgs(['help', 'serve'], '/')).toEqual({ name: 'help', topic: 'serve' })
    expect(parseArgs(['serve', '-h'], '/')).toEqual({ name: 'help', topic: 'serve' })
  })

  it('opens your changes with no arguments, and a target the way :DuckDiff reads it', () => {
    expect(parseArgs([], '/w')).toEqual({
      name: 'open',
      repo: '/w',
      path: '/changes',
      port: 0,
      idleTimeoutMs: 600_000,
      terminal: true,
      browser: true,
    })
    const path = (argv: string[]) => (parseArgs(argv, '/w') as { path: string }).path
    const target = (argv: string[]) => JSON.parse(new URLSearchParams(path(argv).split('?')[1]).get('target') ?? 'null')
    expect(target(['staged'])).toEqual({ kind: 'staged' })
    expect(target(['main'])).toEqual({ kind: 'range', from: 'main', to: 'HEAD', mode: 'merge-base' })
    expect(target(['a...b'])).toEqual({ kind: 'range', from: 'a', to: 'b', mode: 'merge-base' })
    expect(target(['a..b'])).toEqual({ kind: 'range', from: 'a', to: 'b', mode: 'two-dot' })
    expect(target(['commit'])).toEqual({ kind: 'commit', sha: 'HEAD' })
    expect(target(['commit', 'abc'])).toEqual({ kind: 'commit', sha: 'abc' })
    // A branch named like a view is reached through diff.
    expect(target(['diff', 'graph'])).toEqual({ kind: 'range', from: 'graph', to: 'HEAD', mode: 'merge-base' })
  })

  it('opens views by name, with their item or file', () => {
    const path = (argv: string[]) => (parseArgs(argv, '/w') as { path: string }).path
    expect(path(['graph'])).toBe('/graph')
    expect(path(['prs', '12'])).toBe('/prs/12')
    expect(path(['issues', '#3'])).toBe('/issues/3')
    expect(path(['files', 'src/app.ts:40'])).toBe('/files?file=src%2Fapp.ts&line=40')
    expect(parseArgs(['-C', 'r', 'graph', '--no-open', '-p', '9'], '/w')).toMatchObject({
      repo: '/w/r',
      browser: false,
      port: 9,
    })
  })

  it('says what is wrong, plainly', () => {
    expect(() => parseArgs(['--launch'], '/')).toThrow(/unknown option --launch/)
    expect(() => parseArgs(['serve', '--port', 'x'], '/')).toThrow(/port/)
    expect(() => parseArgs(['prs', 'abc'], '/')).toThrow(/prs needs a number/)
    expect(() => parseArgs(['graph', 'x'], '/')).toThrow(/graph takes no argument/)
    expect(() => parseArgs(['serve', 'x'], '/')).toThrow(/serve takes no arguments/)
  })
})

describe("git's tools", () => {
  it('reads what git hands its merge tool, diff tool and sequence editor, from where git runs them', () => {
    expect(parseArgs(['mergetool', 'src/a.ts'], '/r')).toEqual({ name: 'mergetool', repo: '/r', path: '/r/src/a.ts' })
    expect(parseArgs(['difftool', '/tmp/x_a.ts', 'src/a.ts', 'src/a.ts'], '/r')).toEqual({
      name: 'difftool',
      repo: '/r',
      left: '/tmp/x_a.ts',
      right: '/r/src/a.ts',
      path: '/r/src/a.ts',
    })
    expect(parseArgs(['rebase-todo', '/r/.git/rebase-merge/git-rebase-todo'], '/r/sub')).toEqual({
      name: 'rebase-todo',
      repo: '/r/sub',
      todo: '/r/.git/rebase-merge/git-rebase-todo',
    })
    expect(parseArgs(['git-setup', '--off'], '/r')).toEqual({ name: 'git-setup', off: true, quiet: false })
    expect(() => parseArgs(['mergetool'], '/r')).toThrow(/usage/)
  })
})
