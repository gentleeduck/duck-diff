local M = {}

local BROWSERS = { 'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'brave-browser', 'brave' }

---The command that opens `url` as an app window, or nil when the default browser should be used.
---@param opts table plugin config
---@param uname? { sysname: string }
---@param executable? fun(name: string): boolean
function M.command(url, opts, uname, executable)
  if opts.open ~= 'app' then
    return nil
  end
  uname = uname or vim.uv.os_uname()
  executable = executable or function(name)
    return vim.fn.executable(name) == 1
  end
  if uname.sysname == 'Darwin' then
    return { 'open', '-na', opts.browser or 'Google Chrome', '--args', '--app=' .. url }
  end
  if opts.browser then
    return { opts.browser, '--app=' .. url }
  end
  for _, name in ipairs(BROWSERS) do
    if executable(name) then
      return { name, '--app=' .. url }
    end
  end
  return nil
end

function M.open(url, opts)
  if type(opts.open) == 'function' then
    return opts.open(url)
  end
  local cmd = M.command(url, opts)
  if cmd then
    vim.system(cmd, { detach = true })
  else
    vim.ui.open(url)
  end
end

return M
