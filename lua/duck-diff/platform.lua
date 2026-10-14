local M = {}

local OS = { Linux = 'linux', Darwin = 'darwin' }
local ARCH = { x86_64 = 'x64', amd64 = 'x64', aarch64 = 'arm64', arm64 = 'arm64' }

---@param uname? { sysname: string, machine: string }
---@return string asset name of the release binary for this machine
function M.asset(uname)
  uname = uname or vim.uv.os_uname()
  local os, arch = OS[uname.sysname], ARCH[uname.machine]
  if not os or not arch then
    error(('duck-diff: %s %s is not supported'):format(uname.sysname, uname.machine))
  end
  return ('duck-diff-%s-%s'):format(os, arch)
end

return M
