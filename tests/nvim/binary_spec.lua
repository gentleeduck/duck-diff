local binary = require('duck-diff.binary')
local config = require('duck-diff.config')
local platform = require('duck-diff.platform')
local version = require('duck-diff.version')

local function sha256(path)
  return vim.split(vim.fn.system({ 'sha256sum', path }), ' ')[1]
end

-- A fake GitHub release: the asset plus checksums.txt in a folder, fetched over file://.
local function fake_release(contents, checksum)
  local dir = vim.fn.tempname()
  vim.fn.mkdir(dir, 'p')
  local asset = platform.asset()
  local file = dir .. '/' .. asset
  vim.fn.writefile({ contents }, file)
  vim.fn.writefile({ (checksum or sha256(file)) .. '  ' .. asset }, dir .. '/checksums.txt')
  return dir
end

local function ensure()
  local result = {}
  binary.ensure(function(err, path)
    result = { done = true, err = err, path = path }
  end)
  vim.wait(10000, function()
    return result.done
  end)
  return result
end

local function setup(release)
  config.setup({})
  binary.base_url = 'file://' .. release
  binary.report = function() end
  binary.dir = vim.fn.tempname()
  return binary.dir
end

return {
  ['downloads, verifies and caches the binary'] = function()
    local dir = setup(fake_release('#!/bin/sh\necho ok'))
    local first = ensure()
    eq(nil, first.err)
    eq(dir .. '/' .. version .. '/duck-diff', first.path)
    eq(1, vim.fn.executable(first.path))
    binary.base_url = 'file:///nowhere'
    local second = ensure()
    eq(first.path, second.path)
  end,

  ['tells each step as duck-diff update does: the download with its bar, then a check per step'] = function()
    local dir = setup(fake_release(string.rep('x', 200000)))
    local said = {}
    binary.report = function(kind, text)
      table.insert(said, { kind, text })
    end
    local result = ensure()
    eq(nil, result.err)
    eq({ 'step', 'Downloading ' .. platform.asset() }, said[1])
    assert(vim.iter(said):any(function(entry)
      return entry[1] == 'progress' and entry[2]:find('%d+%%  .+ / .+ ') ~= nil
    end), vim.inspect(said))
    local done = vim.iter(said):filter(function(entry)
      return entry[1] == 'done'
    end):map(function(entry)
      return entry[2]
    end):totable()
    eq({ 'Downloaded 195.3 KB', 'The sha256 matches', 'Installed ' .. dir .. '/' .. version .. '/duck-diff' }, done)
  end,

  ['says why when the download cannot be used'] = function()
    setup(fake_release('payload', string.rep('0', 64)))
    local said = {}
    binary.report = function(kind, text)
      table.insert(said, { kind, text })
    end
    ensure()
    eq('fail', said[#said][1])
    assert(said[#said][2]:find('sha256'), vim.inspect(said))
  end,

  ['rejects a checksum mismatch and leaves nothing behind'] = function()
    setup(fake_release('payload', string.rep('0', 64)))
    local result = ensure()
    assert(result.err and result.err:find('sha256'), vim.inspect(result))
    eq(0, vim.fn.filereadable(binary.dir .. '/' .. version .. '/duck-diff'))
  end,

  ['uses a configured binary without downloading'] = function()
    config.setup({ binary = '/usr/bin/true' })
    binary.base_url = 'file:///nowhere'
    eq('/usr/bin/true', ensure().path)
  end,

  ['removes binaries of other versions after installing'] = function()
    local dir = setup(fake_release('x'))
    vim.fn.mkdir(dir .. '/0.0.0-old', 'p')
    eq(nil, ensure().err)
    eq(0, vim.fn.isdirectory(dir .. '/0.0.0-old'))
  end,
}
