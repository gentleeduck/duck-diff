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

  ['keeps the repos it serves out of the user\'s own list'] = function()
    config.setup({ binary = BINARY })
    local dir = repo()
    local started = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(nil, started.err)
    local list = vim.fn.readfile(vim.env.XDG_DATA_HOME .. '/duck-diff/repos.json')
    eq(true, vim.tbl_contains(vim.json.decode(table.concat(list, '\n')), dir))
    eq(true, vim.startswith(vim.env.XDG_DATA_HOME, vim.fn.fnamemodify(vim.fn.tempname(), ':h')))
    server.stop_all()
  end,

  ['a new build takes over the running server in place'] = function()
    -- A private copy, so replacing it stands in for installing a new build.
    local bin = vim.fn.tempname()
    vim.fn.system({ 'cp', BINARY, bin })
    config.setup({ binary = bin })
    local dir = repo()
    local first = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(nil, first.err)
    local function info()
      local out = vim.fn.system({ 'curl', '-s', '-H', 'x-duck-diff-token: ' .. first.value.token, first.value.origin .. '/api/repo' })
      local ok, decoded = pcall(vim.json.decode, out)
      return ok and decoded or nil
    end
    local before = info().build
    vim.fn.system({ 'cp', BINARY, bin .. '.new' })
    vim.fn.system({ 'mv', bin .. '.new', bin })
    vim.wait(10000, function()
      local now = info()
      return now ~= nil and now.build ~= before
    end, 200)
    local after = info()
    assert(after and after.build ~= before, 'expected the new build to answer on the same port and token')
    eq(false, first.value.process:is_closing())
    local again = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(first.value.url, again.value.url)
    server.stop_all()
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

  ['navigate reports no pages when none are open'] = function()
    config.setup({ binary = BINARY })
    local dir = repo()
    local started = await(function(cb)
      server.ensure(dir, cb)
    end)
    eq(nil, started.err)
    local pages = await(function(cb)
      server.navigate(dir, { kind = 'staged' }, function(count)
        cb(nil, count)
      end)
    end)
    eq(0, pages.value)
    server.stop_all()
  end,
}
