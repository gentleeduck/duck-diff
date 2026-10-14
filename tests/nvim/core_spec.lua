local platform = require('duck-diff.platform')
local config = require('duck-diff.config')

local root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h:h')

return {
  ['platform maps os and cpu to release assets'] = function()
    eq('duck-diff-linux-x64', platform.asset({ sysname = 'Linux', machine = 'x86_64' }))
    eq('duck-diff-linux-arm64', platform.asset({ sysname = 'Linux', machine = 'aarch64' }))
    eq('duck-diff-darwin-arm64', platform.asset({ sysname = 'Darwin', machine = 'arm64' }))
    eq('duck-diff-darwin-x64', platform.asset({ sysname = 'Darwin', machine = 'x86_64' }))
  end,

  ['platform refuses unsupported systems'] = function()
    local ok, err = pcall(platform.asset, { sysname = 'Windows_NT', machine = 'x86_64' })
    eq(false, ok)
    assert(tostring(err):find('not supported'), err)
  end,

  ['config merges options over defaults'] = function()
    local opts = config.setup({ open = 'tab', server = { idle_timeout_ms = 5 } })
    eq('tab', opts.open)
    eq(5, opts.server.idle_timeout_ms)
    eq('https://github.com/gentleeduck/duck-diff', opts.repo_url)
    eq(nil, opts.binary)
    eq(opts, config.get())
  end,

  ['plugin version matches the server package'] = function()
    local pkg = vim.json.decode(table.concat(vim.fn.readfile(root .. '/apps/server/package.json'), '\n'))
    eq(pkg.version, require('duck-diff.version'))
  end,
}
