local M = {}

function M.check()
  local health = vim.health
  health.start('duck-diff')
  for _, tool in ipairs({ 'git', 'curl' }) do
    if vim.fn.executable(tool) == 1 then
      health.ok(tool .. ' found')
    else
      health.error(tool .. ' is required')
    end
  end
  if vim.fn.executable('sha256sum') == 1 or vim.fn.executable('shasum') == 1 then
    health.ok('checksum tool found')
  else
    health.error('sha256sum or shasum is required to verify downloads')
  end

  local ok, asset = pcall(require('duck-diff.platform').asset)
  if ok then
    health.ok('release asset: ' .. asset)
  else
    health.error(asset)
  end

  local config = require('duck-diff.config').get()
  local binary = require('duck-diff.binary')
  local path = config.binary or (binary.dir .. '/' .. require('duck-diff.version') .. '/duck-diff')
  if vim.fn.executable(path) == 1 then
    health.ok('binary: ' .. path)
  else
    health.info('binary not downloaded yet; the first :DuckDiff downloads it')
  end

  local command = require('duck-diff.open').command('http://localhost', config)
  if command or config.open ~= 'app' then
    health.ok('opens with: ' .. (command and command[1] or tostring(config.open)))
  else
    health.warn('no Chromium-based browser found for app windows; falling back to the default browser')
  end
end

return M
