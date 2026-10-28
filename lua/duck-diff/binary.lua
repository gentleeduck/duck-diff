local config = require('duck-diff.config')
local platform = require('duck-diff.platform')
local progress = require('duck-diff.progress')
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

local FRAMES = { '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' }
local shown = { step = '', frame = 0, header = false }

-- The first download of a version, told in the command line as duck-diff update tells it in a terminal: the
-- running step with a spinner (and the download's bar beside it, the command line being one row), then a check
-- per finished step, kept in :messages. kind is step, progress, done or fail. Replaceable, for tests.
function M.report(kind, text)
  local function echo(chunks, history)
    vim.api.nvim_echo(chunks, history, {})
  end
  if kind == 'step' then
    if not shown.header then
      echo({ { '🦆 @gentleduck/diff ' .. version, 'Title' } }, true)
      shown.header = true
    end
    shown.step, shown.frame = text, 0
    echo({ { FRAMES[1] .. ' ', 'DiagnosticInfo' }, { text } }, false)
  elseif kind == 'progress' then
    shown.frame = shown.frame + 1
    local room = vim.o.columns - 1 - 2 - vim.fn.strdisplaywidth(shown.step) - 2
    echo({
      { FRAMES[shown.frame % #FRAMES + 1] .. ' ', 'DiagnosticInfo' },
      { shown.step },
      { '  ' .. vim.fn.strcharpart(text, 0, math.max(0, room)), 'Comment' },
    }, false)
  elseif kind == 'done' then
    echo({ { '✔ ', 'DiagnosticOk' }, { text } }, true)
  else
    echo({ { '✖ ', 'DiagnosticError' }, { text } }, true)
  end
end

-- Callbacks run on the main loop so they may touch files and editor state. With progress, curl draws its
-- bar on stderr and progress is told each new whole percent.
local function download(url, dest, done, headers, progress)
  local cmd = { 'curl', '-fSL', progress and '-#' or '-s', '--retry', '2', '-o', dest }
  for _, header in ipairs(headers or {}) do
    vim.list_extend(cmd, { '-H', header })
  end
  table.insert(cmd, url)
  local said, opts = {}, {}
  if progress then
    local shown = -1
    opts.stderr = function(_, data)
      if not data then
        return
      end
      local percent
      for value in data:gmatch('(%d+)%.%d%%') do
        percent = tonumber(value)
      end
      if percent and percent ~= shown then
        shown = percent
        vim.schedule(function()
          progress(percent)
        end)
      end
      -- The last chunks, kept whole: curl's error comes at the end and can arrive split across two.
      table.insert(said, data)
      if #said > 64 then
        table.remove(said, 1)
      end
    end
  end
  vim.system(cmd, opts, vim.schedule_wrap(function(out)
    if out.code == 0 then
      return done(nil)
    end
    local reason = out.stderr
    if not reason then
      local errors = {}
      for line in table.concat(said):gmatch('curl:[^\r\n]*') do
        table.insert(errors, line)
      end
      reason = table.concat(errors, ' ')
    end
    done(('download failed: %s (%s)'):format(url, vim.trim(reason)))
  end))
end

-- Returns a function that downloads a named release file, through the API when a token is available.
local function release_fetcher(callback)
  local token = not M.base_url and M.token()
  local api = token and M.api_release_url()
  if not api then
    return callback(nil, function(name, dest, done, progress)
      download(release_url(name), dest, done, nil, progress)
    end)
  end
  local auth = 'Authorization: Bearer ' .. token
  M.report('step', 'Finding release ' .. version)
  vim.system({ 'curl', '-fsSL', '-H', auth, '-H', 'Accept: application/vnd.github+json', api }, { text = true }, vim.schedule_wrap(function(out)
    local ok, release = pcall(vim.json.decode, out.stdout or '')
    if out.code ~= 0 or not ok or type(release.assets) ~= 'table' then
      return callback(('release v%s not found at %s'):format(version, api))
    end
    M.report('done', 'Found ' .. version)
    local urls, sizes = {}, {}
    for _, asset in ipairs(release.assets) do
      urls[asset.name] = asset.url
      sizes[asset.name] = asset.size
    end
    callback(nil, function(name, dest, done, progress)
      if not urls[name] then
        return done(('release v%s has no %s'):format(version, name))
      end
      download(urls[name], dest, done, { auth, 'Accept: application/octet-stream' }, progress)
    end, sizes)
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
    M.report('fail', err)
    done(err)
  end

  local function install()
    M.report('step', 'Installing ' .. bin)
    vim.uv.fs_chmod(part, tonumber('755', 8))
    -- Apple Silicon kills code whose signature does not check out, so a build that does not verify is signed ad hoc.
    if vim.uv.os_uname().sysname == 'Darwin' then
      vim.system({ 'xattr', '-d', 'com.apple.quarantine', part }):wait()
      if vim.system({ 'codesign', '--verify', '--strict', part }):wait().code ~= 0 then
        if vim.system({ 'codesign', '--force', '--sign', '-', part }):wait().code ~= 0 then
          return fail('could not sign the binary for macOS; nothing was installed')
        end
      end
    end
    -- A new file renamed over the old: macOS kills a binary rewritten in place.
    vim.uv.fs_rename(part, bin)
    vim.fn.delete(sums)
    remove_other_versions()
    M.report('done', 'Installed ' .. bin)
    -- git's tools point at this copy now that the old one is gone.
    -- A copy that cannot run raises here; the install still finishes and the server start says why.
    if config.get().git_setup ~= false then
      pcall(vim.system, { bin, 'git-setup', '--quiet' })
    end
    done(nil, bin)
  end

  local function verify()
    M.report('step', 'Checking the sha256')
    vim.system(sha256_cmd(part), { text = true }, vim.schedule_wrap(function(out)
      local actual = vim.split(out.stdout or '', '%s')[1]
      local expected = expected_sum(sums, asset)
      if not expected or actual ~= expected then
        return fail('the download does not match its sha256; nothing was installed')
      end
      M.report('done', 'The sha256 matches')
      install()
    end))
  end

  release_fetcher(function(lookup_err, fetch, sizes)
    if lookup_err then
      return fail(lookup_err)
    end
    local step = 'Downloading ' .. asset
    M.report('step', step)
    -- The file growing on disk is the progress; its size comes from the release, or from curl's share of it.
    local started, percent = vim.uv.now(), nil
    local total = sizes and sizes[asset] or nil
    local function draw(final)
      local stat = vim.uv.fs_stat(part)
      local got = stat and stat.size or 0
      local known = final and got or total or (percent and percent > 0 and math.floor(got * 100 / percent)) or nil
      local width = math.min(28, vim.o.columns - 1 - 2 - vim.fn.strdisplaywidth(step) - 2 - 48)
      M.report('progress', progress.line(got, known, vim.uv.now() - started, width))
    end
    local timer = vim.uv.new_timer()
    timer:start(100, 100, vim.schedule_wrap(function()
      if not timer:is_closing() then
        draw(false)
      end
    end))
    local function stop()
      if not timer:is_closing() then
        timer:stop()
        timer:close()
      end
    end
    fetch(asset, part, function(err)
      stop()
      if err then
        return fail(err)
      end
      draw(true)
      fetch('checksums.txt', sums, function(sum_err)
        if sum_err then
          return fail(sum_err)
        end
        local stat = vim.uv.fs_stat(part)
        M.report('done', 'Downloaded ' .. progress.bytes(stat and stat.size or 0))
        verify()
      end)
    end, function(share)
      percent = share
    end)
  end)
end

return M
