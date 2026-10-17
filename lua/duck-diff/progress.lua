-- How a download reads while it runs, as duck-diff update draws it (apps/server/src/cli-ui.ts): a bar, the
-- share, the sizes, the speed and the time left.
local M = {}

local UNITS = { 'KB', 'MB', 'GB' }

function M.bytes(n)
  if n < 1024 then
    return ('%d B'):format(n)
  end
  local value, unit = n, 0
  while value >= 1024 and unit < #UNITS do
    value = value / 1024
    unit = unit + 1
  end
  return ('%.1f %s'):format(value, UNITS[unit])
end

local function time_left(seconds)
  local whole = math.max(0, math.ceil(seconds))
  if whole < 60 then
    return ('%ds left'):format(whole)
  end
  return ('%dm %02ds left'):format(math.floor(whole / 60), whole % 60)
end

---@param done integer bytes so far
---@param total integer? bytes in all, when known
---@param elapsed_ms number
---@param width integer the bar's cells; under 6 there is no room for one and the numbers stand alone
function M.line(done, total, elapsed_ms, width)
  local rate = done / (math.max(elapsed_ms, 1) / 1000)
  local speed = M.bytes(math.floor(rate + 0.5)) .. '/s'
  if not total or total <= 0 then
    return M.bytes(done) .. '  ' .. speed
  end
  local fraction = math.min(1, done / total)
  local rest = ('%3d%%  %s / %s  %s'):format(math.floor(fraction * 100), M.bytes(done), M.bytes(total), speed)
  if rate > 0 then
    rest = rest .. '  ' .. time_left((total - done) / rate)
  end
  if width < 6 then
    return (rest:gsub('^%s+', ''))
  end
  local filled = math.floor(fraction * width + 0.5)
  return string.rep('█', filled) .. string.rep('░', width - filled) .. ' ' .. rest
end

return M
