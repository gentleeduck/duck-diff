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

-- Private repos only serve release assets through the API with a token; public ones need none.
function M.token()
  local token = config.get().github_token or vim.env.GITHUB_TOKEN or vim.env.GH_TOKEN
  if token and token ~= '' then
    return token
  end
  if vim.fn.executable('gh') == 1 then
    local out = vim.system({ 'gh', 'auth', 'token' }, { text = true }):wait()
    if out.code == 0 and vim.trim(out.stdout) ~= '' then
      return vim.trim(out.stdout)
    end
  end
end

function M.api_release_url()
  local owner_repo = config.get().repo_url:match('github%.com/([^/]+/[^/]+)')
  return owner_repo and ('https://api.github.com/repos/%s/releases/tags/v%s'):format(owner_repo, version)
end

local function sha256_cmd(path)
  if vim.fn.executable('sha256sum') == 1 then
    return { 'sha256sum', path }
  end
  return { 'shasum', '-a', '256', path }
end

-- Callbacks run on the main loop so they may touch files and editor state.
local function download(url, dest, done, headers)
  local cmd = { 'curl', '-fsSL', '--retry', '2', '-o', dest }
  for _, header in ipairs(headers or {}) do
    vim.list_extend(cmd, { '-H', header })
  end
  table.insert(cmd, url)
  vim.system(cmd, {}, vim.schedule_wrap(function(out)
    if out.code == 0 then
      return done(nil)
    end
    done(('download failed: %s (%s)'):format(url, vim.trim(out.stderr or '')))
  end))
end

-- Returns a function that downloads a named release file, through the API when a token is available.
local function release_fetcher(callback)
  local token = not M.base_url and M.token()
  local api = token and M.api_release_url()
  if not api then
    return callback(nil, function(name, dest, done)
      download(release_url(name), dest, done)
    end)
  end
  local auth = 'Authorization: Bearer ' .. token
  vim.system({ 'curl', '-fsSL', '-H', auth, '-H', 'Accept: application/vnd.github+json', api }, { text = true }, vim.schedule_wrap(function(out)
    local ok, release = pcall(vim.json.decode, out.stdout or '')
    if out.code ~= 0 or not ok or type(release.assets) ~= 'table' then
      return callback(('release v%s not found at %s'):format(version, api))
    end
    local urls = {}
    for _, asset in ipairs(release.assets) do
      urls[asset.name] = asset.url
    end
    callback(nil, function(name, dest, done)
      if not urls[name] then
        return done(('release v%s has no %s'):format(version, name))
      end
      download(urls[name], dest, done, { auth, 'Accept: application/octet-stream' })
    end)
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
  local function fail(err)
    vim.fn.delete(part)
    vim.fn.delete(sums)
    done(err)
  end

  local function verify()
    vim.system(sha256_cmd(part), { text = true }, vim.schedule_wrap(function(out)
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
    end))
  end

  release_fetcher(function(lookup_err, fetch)
    if lookup_err then
      return fail(lookup_err)
    end
    fetch(asset, part, function(err)
      if err then
        return fail(err)
      end
      fetch('checksums.txt', sums, function(sum_err)
        if sum_err then
          return fail(sum_err)
        end
        verify()
      end)
    end)
  end)
end

return M
