local config = require('duck-diff.config')
local platform = require('duck-diff.platform')
local version = require('duck-diff.version')

local M = {}

-- Overridable for tests; by default the GitHub release matching the plugin version.
M.base_url = nil
M.dir = vim.fn.stdpath('data') .. '/duck-diff/bin'

local function release_url(file)
  local base = M.base_url or (config.get().repo_url .. '/releases/download/v' .. version)
  return base .. '/' .. file
end

local function sha256_cmd(path)
  if vim.fn.executable('sha256sum') == 1 then
    return { 'sha256sum', path }
  end
  return { 'shasum', '-a', '256', path }
end

-- Callbacks run on the main loop so they may touch files and editor state.
local function download(url, dest, done)
  vim.system({ 'curl', '-fsSL', '--retry', '2', '-o', dest, url }, {}, vim.schedule_wrap(function(out)
    if out.code == 0 then
      return done(nil)
    end
    done(('download failed: %s (%s)'):format(url, vim.trim(out.stderr or '')))
  end))
end

local function expected_sum(checksums, asset)
  for _, line in ipairs(vim.fn.readfile(checksums)) do
    local sum, name = line:match('^(%x+)%s+%*?(%S+)$')
    if name == asset then
      return sum
    end
  end
end

local function remove_other_versions()
  for name, kind in vim.fs.dir(M.dir) do
    if kind == 'directory' and name ~= version then
      vim.fn.delete(M.dir .. '/' .. name, 'rf')
    end
  end
end

---Resolves the binary path, downloading and verifying the release once per version.
---@param callback fun(err: string?, path: string?)
function M.ensure(callback)
  local done = vim.schedule_wrap(callback)
  local configured = config.get().binary
  if configured then
    return done(nil, configured)
  end

  local dir = M.dir .. '/' .. version
  local bin = dir .. '/duck-diff'
  if vim.fn.executable(bin) == 1 then
    return done(nil, bin)
  end

  local ok, asset = pcall(platform.asset)
  if not ok then
    return done(asset)
  end
  vim.fn.mkdir(dir, 'p')
  local part, sums = bin .. '.part', dir .. '/checksums.txt'
  local fail = function(err)
    vim.fn.delete(part)
    vim.fn.delete(sums)
    done(err)
  end

  download(release_url(asset), part, function(err)
    if err then
      return fail(err)
    end
    download(release_url('checksums.txt'), sums, function(sum_err)
      if sum_err then
        return fail(sum_err)
      end
      vim.system(sha256_cmd(part), { text = true }, function(out)
        vim.schedule(function()
          local actual = vim.split(out.stdout or '', '%s')[1]
          local expected = expected_sum(sums, asset)
          if not expected or actual ~= expected then
            return fail(('checksum mismatch for %s'):format(asset))
          end
          vim.uv.fs_rename(part, bin)
          vim.uv.fs_chmod(bin, tonumber('755', 8))
          vim.fn.delete(sums)
          remove_other_versions()
          done(nil, bin)
        end)
      end)
    end)
  end)
end

return M
