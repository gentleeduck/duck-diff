local config = require('duck-diff.config')
local server = require('duck-diff.server')

local root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h:h')
local BINARY = root .. '/apps/server/dist/duck-diff'

local function repo()
  local dir = vim.fn.tempname()
  vim.fn.mkdir(dir, 'p')
  vim.fn.system({ 'git', '-C', dir, 'init', '-q', '-b', 'main' })
  vim.fn.writefile({ 'a' }, dir .. '/a.txt')
  vim.fn.system({ 'git', '-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base', '--allow-empty' })
  return vim.fn.resolve(dir)
end

local function await(start)
  local result
  start(function(err, value)
    result = { err = err, value = value }
  end)
  vim.wait(15000, function()
    return result ~= nil
  end)
  return result or { err = 'timed out' }
end

-- Needs `bun run build` first; skipped otherwise so the Lua suite stays independent of the JS build.
if vim.fn.executable(BINARY) == 0 then
  return { ['skipped: no compiled binary'] = function() end }
end

return {
  ['starts one server per repo and reuses it'] = function()
    config.setup({ binary = BINARY })
    local dir = repo()
    local first = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(nil, first.err)
    assert(first.value.url:match('^http://127%.0%.0%.1:%d+/%?token=%x+$'), first.value.url)
    local second = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(first.value.url, second.value.url)
    local info = vim.fn.system({ 'curl', '-s', '-H', 'x-duck-diff-token: ' .. first.value.token, first.value.origin .. '/api/repo' })
    eq(true, vim.json.decode(info).nvim)
    server.stop_all()
    vim.wait(3000, function()
      return server.get(dir) == nil
    end)
    eq(nil, server.get(dir))
  end,

  ['saved pings the server'] = function()
    config.setup({ binary = BINARY })
    local dir = repo()
    local started = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(nil, started.err)
    local status = await(function(cb)
      server.saved(dir, cb)
    end)
    eq(204, status.value)
    server.stop_all()
  end,
}
