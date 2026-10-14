local config = require('duck-diff.config')

local M = {}

local group = vim.api.nvim_create_augroup('duck-diff', { clear = true })

function M.setup(opts)
  config.setup(opts)
  local server = require('duck-diff.server')
  vim.api.nvim_create_autocmd('BufWritePost', {
    group = group,
    callback = function(event)
      local root = vim.fs.root(event.buf, '.git')
      if root and server.get(vim.fn.resolve(root)) then
        server.saved(vim.fn.resolve(root))
      end
    end,
  })
  vim.api.nvim_create_autocmd('VimLeavePre', { group = group, callback = server.stop_all })
end

return M
