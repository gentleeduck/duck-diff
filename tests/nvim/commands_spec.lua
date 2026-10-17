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

  ['parses commits, defaulting to HEAD'] = function()
    eq({ kind = 'commit', sha = 'abc1234' }, target.parse('commit abc1234'))
    eq({ kind = 'commit', sha = 'HEAD' }, target.parse('commit'))
  end,

  ['rejects refs that look like options'] = function()
    eq(false, (pcall(target.parse, '--exec=x')))
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
    eq({ 'feature' }, commands.complete('fea'))
    eq({ 'main...feature' }, commands.complete('main...fe'))
  end,

  ['the plugin file registers the command'] = function()
    vim.g.loaded_duck_diff = nil
    vim.cmd.runtime('plugin/duck-diff.lua')
    eq(2, vim.fn.exists(':DuckDiff'))
  end,
}
