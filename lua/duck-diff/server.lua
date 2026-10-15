local binary = require('duck-diff.binary')
local config = require('duck-diff.config')

local M = {}

---@class DuckDiffServer
---@field url string page url including the token
---@field origin string
---@field token string
---@field process vim.SystemObj
---@field stamp string? the binary it was started from, as stamp() sees it

---@type table<string, DuckDiffServer>
local servers = {}

function M.get(root)
  return servers[root]
end

-- Identifies the file a server runs from; installing a new build (copy, then rename) changes it.
local function stamp(bin)
  local stat = vim.uv.fs_stat(bin)
  if not stat then
    return nil
  end
  return ('%d:%d:%d:%d'):format(stat.mtime.sec, stat.mtime.nsec, stat.size, stat.ino)
end

local start

---Starts the server for `root` once and hands the same one back afterwards, unless a newer build has
---been installed since it started: then the old one stops and the new build serves instead.
---@param callback fun(err: string?, server: DuckDiffServer?)
function M.ensure(root, callback)
  binary.ensure(function(err, bin)
    if err then
      return callback(err)
    end
    local running = servers[root]
    if running then
      if running.stamp == stamp(bin) then
        return callback(nil, running)
      end
      vim.notify('duck-diff: a new build is installed, restarting the server', vim.log.levels.INFO)
      M.stop(root)
    end
    start(root, bin, callback)
  end)
end

function start(root, bin, callback)
  local cmd = { bin, 'serve', '--repo', root, '--idle-timeout-ms', tostring(config.get().server.idle_timeout_ms) }
  if vim.v.servername ~= '' then
    vim.list_extend(cmd, { '--nvim', vim.v.servername })
  end
  local buffered, answered = '', false
  local answer = vim.schedule_wrap(function(start_err, server)
    if answered then
      return
    end
    answered = true
    callback(start_err, server)
  end)
  local process
  local built = stamp(bin)
  -- stdin stays open for the server's lifetime; when Neovim exits the pipe closes and the server stops.
  process = vim.system(cmd, {
    stdin = true,
    stdout = function(_, data)
      if answered or not data then
        return
      end
      buffered = buffered .. data
      local line = buffered:match('^(.-)\n')
      if not line then
        return
      end
      local ok, handshake = pcall(vim.json.decode, line)
      if not ok then
        return answer('duck-diff: bad handshake: ' .. line)
      end
      local server = {
        url = handshake.url,
        token = handshake.token,
        origin = ('http://127.0.0.1:%d'):format(handshake.port),
        process = process,
        stamp = built,
      }
      servers[root] = server
      answer(nil, server)
    end,
  }, function(out)
    vim.schedule(function()
      -- A restart has already put the new server here; only this one's own entry is cleared.
      if servers[root] and servers[root].process == process then
        servers[root] = nil
      end
    end)
    answer(('duck-diff exited (%d): %s'):format(out.code, vim.trim(out.stderr or '')))
  end)
end

---Tells the server a buffer was written so the page refreshes without waiting for the file watcher.
---@param callback? fun(err: string?, status: integer?)
function M.saved(root, callback)
  local server = servers[root]
  if not server then
    return callback and callback('no server')
  end
  vim.system({
    'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST',
    '-H', 'x-duck-diff-token: ' .. server.token, server.origin .. '/api/saved',
  }, { text = true }, vim.schedule_wrap(function(out)
    if callback then
      callback(nil, tonumber(out.stdout))
    end
  end))
end

---Asks an open page to switch comparison; answers how many pages were listening.
---@param callback fun(pages: integer)
function M.navigate(root, diff_target, callback)
  local server = servers[root]
  if not server then
    return callback(0)
  end
  vim.system({
    'curl', '-s', '-X', 'POST', '-H', 'content-type: application/json',
    '-H', 'x-duck-diff-token: ' .. server.token,
    '--data-binary', vim.json.encode({ target = diff_target }), server.origin .. '/api/navigate',
  }, { text = true }, vim.schedule_wrap(function(out)
    local ok, body = pcall(vim.json.decode, out.stdout or '')
    callback(ok and type(body) == 'table' and tonumber(body.pages) or 0)
  end))
end

function M.stop(root)
  local server = servers[root]
  if server then
    servers[root] = nil
    server.process:kill(15)
  end
end

function M.stop_all()
  for root in pairs(servers) do
    M.stop(root)
  end
end

return M
