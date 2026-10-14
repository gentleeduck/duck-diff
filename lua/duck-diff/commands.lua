local config = require('duck-diff.config')
local open = require('duck-diff.open')
local server = require('duck-diff.server')
local target = require('duck-diff.target')

local M = {}

local SUBCOMMANDS = { 'staged', 'unstaged', 'local', 'commit', 'status', 'close', 'build' }

local function notify(message, level)
  vim.notify('duck-diff: ' .. message, level or vim.log.levels.INFO)
end

function M.root()
  local found = vim.fs.root(0, '.git')
  return found and vim.fn.resolve(found) or nil
end

local function show(root, diff_target)
  server.ensure(root, function(err, running)
    if err then
      return notify(err, vim.log.levels.ERROR)
    end
    open.open(target.url(running.url, diff_target), config.get())
  end)
end

-- Builds the binary from this checkout with Bun, for machines where the release download is not an option.
local function build()
  local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h:h')
  notify('building with bun, this takes a minute')
  vim.system({ 'sh', '-c', 'bun install && bun run build' }, { cwd = plugin_root }, vim.schedule_wrap(function(out)
    if out.code ~= 0 then
      return notify('build failed: ' .. vim.trim(out.stderr or ''), vim.log.levels.ERROR)
    end
    config.get().binary = plugin_root .. '/apps/server/dist/duck-diff'
    notify('built ' .. config.get().binary)
  end))
end

function M.run(args)
  local root = M.root()
  if args == 'build' then
    return build()
  end
  if not root then
    return notify('not inside a git repository', vim.log.levels.WARN)
  end
  if args == 'status' then
    local running = server.get(root)
    return notify(running and ('running at ' .. running.url) or 'not running for ' .. root)
  end
  if args == 'close' then
    server.stop(root)
    return notify('stopped')
  end
  local ok, diff_target = pcall(target.parse, args)
  if not ok then
    return notify(diff_target, vim.log.levels.ERROR)
  end
  show(root, diff_target)
end

function M.complete(lead)
  local refs = vim.fn.systemlist({ 'git', 'for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/tags', 'refs/remotes' })
  if vim.v.shell_error ~= 0 then
    refs = {}
  end
  local candidates = vim.list_extend(vim.deepcopy(SUBCOMMANDS), refs)
  -- After `a..` or `a...`, complete the right-hand ref.
  local prefix = lead:match('^(.-%.%.%.?)') or ''
  local needle = lead:sub(#prefix + 1)
  return vim.tbl_map(
    function(candidate)
      return prefix .. candidate
    end,
    vim.tbl_filter(function(candidate)
      return vim.startswith(candidate, needle)
    end, prefix == '' and candidates or refs)
  )
end

return M
