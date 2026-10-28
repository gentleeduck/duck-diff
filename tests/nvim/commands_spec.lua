local open = require('duck-diff.open')
local target = require('duck-diff.target')

local linux = { sysname = 'Linux', machine = 'x86_64' }
local mac = { sysname = 'Darwin', machine = 'arm64' }

return {
  ['parses local states'] = function()
    eq({ kind = 'local' }, target.parse(''))
    eq({ kind = 'local' }, target.parse('local'))
    eq({ kind = 'staged' }, target.parse('staged'))
    eq({ kind = 'unstaged' }, target.parse('unstaged'))
  end,

  ['parses ranges and a bare ref as the branch against it'] = function()
    eq({ kind = 'range', from = 'main', to = 'feat/x', mode = 'merge-base' }, target.parse('main...feat/x'))
    eq({ kind = 'range', from = 'v1', to = 'HEAD', mode = 'two-dot' }, target.parse('v1..HEAD'))
    eq({ kind = 'range', from = 'main', to = 'HEAD', mode = 'merge-base' }, target.parse('main'))
  end,

  ['takes diff <target> as a diff, even for a ref named like a view'] = function()
    eq({ kind = 'range', from = 'graph', to = 'HEAD', mode = 'merge-base' }, target.parse('diff graph'))
    eq({ kind = 'staged' }, target.parse('diff staged'))
    eq({ kind = 'local' }, target.parse('diff'))
    eq(nil, target.view({ 'diff', 'graph' }))
  end,

  ['parses commits, defaulting to HEAD'] = function()
    eq({ kind = 'commit', sha = 'abc1234' }, target.parse('commit abc1234'))
    eq({ kind = 'commit', sha = 'HEAD' }, target.parse('commit'))
  end,

  ['rejects refs that look like options'] = function()
    eq(false, (pcall(target.parse, '--exec=x')))
  end,

  ['reads views by name as the command line does, and leaves diffs alone'] = function()
    eq('/graph', target.view({ 'graph' }))
    eq('/prs', target.view({ 'prs' }))
    eq('/prs/12', target.view({ 'prs', '#12' }))
    eq('/issues/3', target.view({ 'issues', '3' }))
    eq('/files', target.view({ 'files' }))
    eq('/files?file=src%2Fapp.ts&line=40', target.view({ 'files', 'src/app.ts:40' }))
    eq('/files?file=README.md', target.view({ 'files', 'README.md' }))
    eq(nil, target.view({}))
    eq(nil, target.view({ 'main...feat/x' }))
    eq(nil, target.view({ 'commit', 'abc1234' }))
    eq(false, (pcall(target.view, { 'prs', 'abc' })))
    eq(false, (pcall(target.view, { 'graph', 'x' })))
    eq(false, (pcall(target.view, { 'files', 'a', 'b' })))
  end,

  ['reads a file named from inside the repo from where Neovim is, as git does'] = function()
    eq('/files?file=src%2Fapp.ts&line=4', target.view({ 'files', 'app.ts:4' }, '/r', '/r/src'))
    eq('/files?file=src%2Fapp.ts', target.view({ 'files', 'src/app.ts' }, '/r', '/r'))
    eq('/files?file=src%2Fapp.ts', target.view({ 'files', 'src/app.ts' }, '/r', '/elsewhere'))
    eq('/files?file=lib%2Fa.ts', target.view({ 'files', '../lib/a.ts' }, '/r', '/r/src'))
  end,

  ['keeps a path with a space, as Neovim splits an escaped one, and a $name as written'] = function()
    eq('/files?file=docs%2Fmy%20file.md', target.view({ 'files', 'my file.md' }, '/r', '/r/docs'))
    eq('/files?file=src%2F%24USER.tsx', target.view({ 'files', '$USER.tsx' }, '/r', '/r/src'))
  end,

  ['puts the token on a view path'] = function()
    local server = { origin = 'http://127.0.0.1:9', token = 'ab' }
    eq('http://127.0.0.1:9/graph?token=ab', target.page_url(server, '/graph'))
    eq('http://127.0.0.1:9/files?file=a&token=ab', target.page_url(server, '/files?file=a'))
  end,

  ['adds the target to the page url'] = function()
    local url = target.url('http://127.0.0.1:9/?token=ab', { kind = 'staged' })
    eq('http://127.0.0.1:9/?token=ab&target=%7B%22kind%22%3A%22staged%22%7D', url)
  end,

  ['builds the app window command per platform'] = function()
    local has = function(name)
      return name == 'chromium'
    end
    eq({ 'chromium', '--app=http://x' }, open.command('http://x', { open = 'app' }, linux, has))
    eq({ 'brave', '--app=http://x' }, open.command('http://x', { open = 'app', browser = 'brave' }, linux, has))
    eq({ 'open', '-na', 'Google Chrome', '--args', '--app=http://x' }, open.command('http://x', { open = 'app' }, mac, has))
    eq(nil, open.command('http://x', { open = 'tab' }, linux, has))
    eq(nil, open.command('http://x', { open = 'app' }, linux, function() return false end))
  end,

  ['opens a page the server asks for with the configured opener'] = function()
    local got
    require('duck-diff.config').setup({ open = function(url)
      got = url
    end })
    open.page('http://127.0.0.1:2/?token=t')
    eq('http://127.0.0.1:2/?token=t', got)
    require('duck-diff.config').setup({})
  end,

  ['completes subcommands, refs and the right side of a range'] = function()
    local commands = require('duck-diff.commands')
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, 'p')
    vim.fn.system({ 'git', '-C', dir, 'init', '-q', '-b', 'main' })
    vim.fn.system({ 'git', '-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base', '--allow-empty' })
    vim.fn.system({ 'git', '-C', dir, 'branch', 'feature' })
    vim.cmd.cd(dir)
    eq({ 'staged', 'status' }, commands.complete('sta'))
    eq({ 'graph' }, commands.complete('gra'))
    eq({ 'diff', 'discussions' }, commands.complete('di'))
    eq({ 'feature' }, commands.complete('fea'))
    eq({ 'main...feature' }, commands.complete('main...fe'))
  end,

  ['completes a path after files, and nothing after views that take none'] = function()
    local commands = require('duck-diff.commands')
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. '/src', 'p')
    vim.fn.writefile({}, dir .. '/src/app.ts')
    vim.fn.system({ 'git', '-C', dir, 'init', '-q', '-b', 'main' })
    vim.fn.system({ 'git', '-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base', '--allow-empty' })
    vim.cmd.cd(dir)
    eq({ 'src/' }, commands.complete('sr', 'DuckDiff files sr'))
    eq({ 'src/app.ts' }, commands.complete('src/a', 'DuckDiff files src/a'))
    eq({}, commands.complete('', 'DuckDiff files src/app.ts '))
    eq({}, commands.complete('', 'DuckDiff graph '))
    eq({}, commands.complete('1', 'DuckDiff prs 1'))
    eq({ 'main' }, commands.complete('ma', 'DuckDiff diff ma'))
  end,

  ['the plugin file registers the command'] = function()
    vim.g.loaded_duck_diff = nil
    vim.cmd.runtime('plugin/duck-diff.lua')
    eq(2, vim.fn.exists(':DuckDiff'))
  end,
}
