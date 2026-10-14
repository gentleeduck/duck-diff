local binary = require('duck-diff.binary')
local config = require('duck-diff.config')

local M = {}

---@class DuckDiffServer
---@field url string page url including the token
---@field origin string
---@field token string
---@field process vim.SystemObj

---@type table<string, DuckDiffServer>
local servers = {}

function M.get(root)
  return servers[root]
end

---Starts the server for `root` once and hands the same one back afterwards.
---@param callback fun(err: string?, server: DuckDiffServer?)
function M.ensure(root, callback)
  if servers[root] then
    return callback(nil, servers[root])
  end
  binary.ensure(function(err, bin)
    if err then
      return callback(err)
    end
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
        }
        servers[root] = server
        answer(nil, server)
      end,
    }, function(out)
      vim.schedule(function()
        servers[root] = nil
      end)
      answer(('duck-diff exited (%d): %s'):format(out.code, vim.trim(out.stderr or '')))
    end)
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
